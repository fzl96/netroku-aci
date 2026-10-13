import { describe, expect, it } from 'bun:test'
import { parseRunningConfig } from './parser'
import { evaluateCompliance } from './evaluate'
import { policySchema, type Policy } from './policy'

const iosxe = `!
aaa group server tacacs+ ISE
 server-private 10.220.121.236 key 7 SECRET_ONE
 server-private 10.222.121.236 key 7 SECRET_TWO
 ip vrf forwarding Mgmt-intf
 ip tacacs source-interface GigabitEthernet0
!
ntp server vrf Mgmt-intf 10.0.14.248
ntp server vrf Mgmt-intf 10.0.142.8
ntp server vrf Mgmt-intf 10.0.14.6
ntp server vrf Mgmt-intf 10.0.142.7
!`
const nxos = `!
aaa group server tacacs+ ISE
    server 10.220.121.236
    server 10.222.121.236
    use-vrf management
    source-interface mgmt0
!
ntp server 10.0.14.248 prefer use-vrf management
ntp server 10.0.142.8 prefer use-vrf management
ntp server 10.222.13.22 prefer use-vrf management
!`
const policies: Policy[] = [
  {
    service: 'ntp',
    enabled: true,
    expectedIps: ['10.0.14.6', '10.0.14.248', '10.0.142.7', '10.0.142.8'],
  },
  { service: 'tacacs', enabled: true, expectedIps: ['10.220.121.236', '10.222.121.236'] },
]

describe('running-config parsing and exact compliance', () => {
  it('extracts the supplied IOS-XE and NX-OS forms without returning keys, VRFs or interfaces', () => {
    const ios = parseRunningConfig(iosxe.replaceAll('\n', '\r\n'), 'iosxe')
    expect(ios.ntp).toEqual({ ips: policies[0].expectedIps, reason: null })
    expect(ios.tacacs).toEqual({ ips: policies[1].expectedIps, reason: null })
    const nx = parseRunningConfig(nxos, 'nxos')
    expect(nx.tacacs).toEqual(ios.tacacs)
    expect(nx.ntp).toEqual({ ips: ['10.0.14.248', '10.0.142.8', '10.222.13.22'], reason: null })
    expect(JSON.stringify(ios)).not.toContain('SECRET')
    expect(
      evaluateCompliance({ rawConfig: iosxe, platform: 'iosxe' }, policies).map(
        (result) => result.status,
      ),
    ).toEqual(['compliant', 'compliant'])
    const result = evaluateCompliance({ rawConfig: nxos, platform: 'nxos' }, policies)[0]
    expect(result.status).toBe('noncompliant')
    expect(result.missing).toEqual(['10.0.14.6', '10.0.142.7'])
    expect(result.unexpected).toEqual(['10.222.13.22'])
  })

  it('ignores duplicate IPs, server ordering and unrelated RADIUS/interface addresses', () => {
    const rawConfig = `${iosxe}\naaa group server radius RADIUS\n server-private 192.0.2.100 key unrelated\n!\ninterface Loopback0\n ip address 192.0.2.200 255.255.255.255\n!\nntp server 10.0.14.6 prefer\naaa group server tacacs+ SECOND\n server-private 10.222.121.236 key 7 duplicate\n!`
    expect(
      evaluateCompliance({ rawConfig, platform: 'iosxe' }, policies).every(
        (result) => result.status === 'compliant',
      ),
    ).toBe(true)
  })

  it('checks every TACACS group, standalone host and IOS-XE named server declaration', () => {
    const rawConfig = `${iosxe}\naaa group server tacacs+ OLD\n server-private 192.0.2.1 key 7 ignored\n!\ntacacs-server host 192.0.2.2 key ignored\ntacacs server NAMED\n address ipv4 192.0.2.3\n key ignored\n!\naaa group server tacacs+ NAMED-GROUP\n server name NAMED\n!`
    const result = evaluateCompliance({ rawConfig, platform: 'iosxe' }, policies)[1]
    expect(result.status).toBe('noncompliant')
    expect(result.unexpected).toEqual(['192.0.2.1', '192.0.2.2', '192.0.2.3'])
    expect(result.missing).toEqual([])
    expect(
      parseRunningConfig('tacacs-server host 192.0.2.4 key 7 secret', 'nxos').tacacs.ips,
    ).toEqual(['192.0.2.4'])
  })

  it('does not count negated commands as configured servers', () => {
    const rawConfig = `${iosxe}\nno ntp server 192.0.2.10\nno tacacs-server host 192.0.2.11\naaa group server tacacs+ TEST\n no server-private 192.0.2.12\n!`
    expect(
      evaluateCompliance({ rawConfig, platform: 'iosxe' }, policies).every(
        (result) => result.status === 'compliant',
      ),
    ).toBe(true)
  })

  it('excludes command-looking banner text and rejects an unfinished banner', () => {
    const rawConfig = `${iosxe}\nbanner motd ^C\nntp server 192.0.2.90\ntacacs-server host 192.0.2.91\n% Invalid input\n^C\n`
    expect(
      evaluateCompliance({ rawConfig, platform: 'iosxe' }, policies).every(
        (result) => result.status === 'compliant',
      ),
    ).toBe(true)
    expect(
      evaluateCompliance(
        { rawConfig: `${iosxe}\nbanner motd #\nunfinished`, platform: 'iosxe' },
        policies,
      )[0].status,
    ).toBe('unknown')
  })

  it('reports an absent service in a readable config as noncompliant', () => {
    const result = evaluateCompliance(
      {
        rawConfig: 'hostname switch-01\ninterface GigabitEthernet0\n description Management\n!',
        platform: 'iosxe',
      },
      policies,
    )
    expect(result.map((entry) => entry.status)).toEqual(['noncompliant', 'noncompliant'])
    expect(result[0].missing).toEqual(policies[0].expectedIps)
  })

  it('distinguishes missing or unusable captures from a readable config without servers', () => {
    expect(evaluateCompliance(null, policies)[0]).toMatchObject({
      status: 'unknown',
      reason: 'No saved configuration',
    })
    for (const rawConfig of ['', 'garbage', '% Invalid input detected', `${iosxe}\n--More--`]) {
      expect(
        evaluateCompliance({ rawConfig, platform: 'iosxe' }, policies).every(
          (entry) => entry.status === 'unknown',
        ),
      ).toBe(true)
    }
    expect(
      evaluateCompliance({ rawConfig: iosxe, platform: 'unsupported' }, policies)[0].status,
    ).toBe('unknown')
  })

  it('does not silently skip hostnames, IPv6, invalid IPs or unresolved named TACACS servers', () => {
    for (const address of ['ntp.example.com', '2001:db8::1', '999.0.0.1']) {
      const result = evaluateCompliance(
        { rawConfig: `${iosxe}\nntp server ${address}`, platform: 'iosxe' },
        policies,
      )
      expect(result[0].status).toBe('unknown')
      expect(result[1].status).toBe('compliant')
    }
    const unresolved = `${iosxe}\naaa group server tacacs+ UNKNOWN\n server name MISSING\n!`
    expect(
      evaluateCompliance({ rawConfig: unresolved, platform: 'iosxe' }, policies)[1].status,
    ).toBe('unknown')
    expect(
      parseRunningConfig('tacacs server IPV6\n address ipv6 2001:db8::1', 'iosxe').tacacs.reason,
    ).not.toBeNull()
  })

  it('keeps disabled services and ACI assets unevaluated, and uses current policy values', () => {
    const disabled: Policy[] = policies.map((policy) => ({
      ...policy,
      enabled: false,
      expectedIps: [],
    }))
    expect(
      evaluateCompliance(null, disabled).every((result) => result.status === 'not-evaluated'),
    ).toBe(true)
    expect(
      evaluateCompliance(null, policies, true).every((result) => result.status === 'not-evaluated'),
    ).toBe(true)
    const changed = policies.map((policy) =>
      policy.service === 'ntp' ? { ...policy, expectedIps: ['192.0.2.1'] } : policy,
    )
    expect(evaluateCompliance({ rawConfig: iosxe, platform: 'iosxe' }, changed)[0].missing).toEqual(
      ['192.0.2.1'],
    )
  })
})

describe('global policy validation', () => {
  it('normalizes duplicates and requires IPv4 addresses for an enabled policy', () => {
    expect(
      policySchema.parse({
        service: 'ntp',
        enabled: true,
        expectedIps: [' 10.0.142.8 ', '10.0.14.6', '10.0.14.6'],
      }).expectedIps,
    ).toEqual(['10.0.14.6', '10.0.142.8'])
    expect(policySchema.safeParse({ service: 'ntp', enabled: true, expectedIps: [] }).success).toBe(
      false,
    )
    expect(
      policySchema.safeParse({ service: 'ntp', enabled: false, expectedIps: [] }).success,
    ).toBe(true)
    for (const address of ['256.1.2.3', '192.0.2', '01.2.3.4', '::1', 'server.example.com']) {
      expect(
        policySchema.safeParse({ service: 'tacacs', enabled: true, expectedIps: [address] })
          .success,
      ).toBe(false)
    }
  })
})
