import { describe, expect, it } from 'bun:test'
import { parseEpgRows, parsePathTDn, domainLabelFromTDn } from './epg-inventory'

describe('parsePathTDn', () => {
  it('parses a physical port path', () => {
    expect(parsePathTDn('topology/pod-1/paths-101/pathep-[eth1/10]')).toEqual({
      pod: '1', node: '101', port: 'eth1/10', pathType: 'port',
    })
  })

  it('parses a vPC protection path as an ascending node pair', () => {
    expect(parsePathTDn('topology/pod-2/protpaths-3114-3113/pathep-[SRV01_VPC_IPG]')).toEqual({
      pod: '2', node: '3113-3114', port: 'SRV01_VPC_IPG', pathType: 'vpc',
    })
  })

  it('classifies a non-eth single path as a direct port-channel', () => {
    expect(parsePathTDn('topology/pod-1/paths-101/pathep-[SRV02_PC_IPG]')).toEqual({
      pod: '1', node: '101', port: 'SRV02_PC_IPG', pathType: 'dpc',
    })
  })

  it('falls back to unknown for unrecognized shapes', () => {
    const tDn = 'topology/pod-1/paths-101/extpaths-102/pathep-[eth1/1]'
    expect(parsePathTDn(tDn)).toEqual({ pod: '1', node: '', port: tDn, pathType: 'unknown' })
  })
})

describe('domainLabelFromTDn', () => {
  it('labels physical, l2, l3 and vmm domains', () => {
    expect(domainLabelFromTDn('uni/phys-PHYS_DOM')).toBe('PHYS_DOM (physical)')
    expect(domainLabelFromTDn('uni/l2dom-L2_DOM')).toBe('L2_DOM (l2)')
    expect(domainLabelFromTDn('uni/l3dom-L3_DOM')).toBe('L3_DOM (l3)')
    expect(domainLabelFromTDn('uni/vmmp-VMware/dom-VC_DOM')).toBe('VC_DOM (vmm VMware)')
  })

  it('falls back to the raw tDn', () => {
    expect(domainLabelFromTDn('uni/somethingelse')).toBe('uni/somethingelse')
  })
})

describe('parseEpgRows', () => {
  const imdata = [
    {
      fvAEPg: {
        attributes: {
          dn: 'uni/tn-serverfarm/ap-DC2-AP/epg-VLAN1411_EPG',
          name: 'VLAN1411_EPG',
          descr: 'Server VLAN 1411',
          pcTag: '16386',
          prefGrMemb: 'include',
          pcEnfPref: 'enforced',
        },
        children: [
          { fvRsBd: { attributes: { tnFvBDName: 'VLAN1411-BD' } } },
          { fvRsDomAtt: { attributes: { tDn: 'uni/phys-PHYS_DOM' } } },
          { fvRsProv: { attributes: { tnVzBrCPName: 'web-contract' } } },
          { fvRsCons: { attributes: { tnVzBrCPName: 'db-contract' } } },
          {
            fvRsPathAtt: {
              attributes: {
                tDn: 'topology/pod-1/paths-101/pathep-[eth1/10]',
                encap: 'vlan-1411',
                mode: 'regular',
              },
            },
          },
          {
            fvRsPathAtt: {
              attributes: {
                tDn: 'topology/pod-1/protpaths-101-102/pathep-[SRV_VPC_IPG]',
                encap: 'vlan-1411',
                mode: 'untagged',
              },
            },
          },
        ],
      },
    },
    // An EPG with no children at all
    {
      fvAEPg: {
        attributes: {
          dn: 'uni/tn-TenantA/ap-App1-AP/epg-DB-EPG',
          name: 'DB-EPG',
          descr: '',
          pcTag: '49153',
          prefGrMemb: 'exclude',
          pcEnfPref: 'unenforced',
        },
      },
    },
  ]

  it('parses identity, policy, relations and bindings', () => {
    const rows = parseEpgRows(imdata)
    expect(rows).toHaveLength(2)

    const [epg, empty] = rows
    expect(epg.tenant).toBe('serverfarm')
    expect(epg.appProfile).toBe('DC2-AP')
    expect(epg.name).toBe('VLAN1411_EPG')
    expect(epg.description).toBe('Server VLAN 1411')
    expect(epg.bridgeDomain).toBe('VLAN1411-BD')
    expect(epg.pcTag).toBe('16386')
    expect(epg.preferredGroup).toBe(true)
    expect(epg.isolation).toBe(true)
    expect(epg.domains).toEqual(['PHYS_DOM (physical)'])
    expect(epg.providedContracts).toEqual(['web-contract'])
    expect(epg.consumedContracts).toEqual(['db-contract'])

    expect(epg.bindings).toHaveLength(2)
    const [phys, vpc] = epg.bindings
    expect(phys.dn).toBe(
      'uni/tn-serverfarm/ap-DC2-AP/epg-VLAN1411_EPG/rspathAtt-[topology/pod-1/paths-101/pathep-[eth1/10]]',
    )
    expect(phys.node).toBe('101')
    expect(phys.port).toBe('eth1/10')
    expect(phys.pathType).toBe('port')
    expect(phys.encap).toBe('vlan-1411')
    expect(phys.mode).toBe('trunk')
    expect(vpc.node).toBe('101-102')
    expect(vpc.port).toBe('SRV_VPC_IPG')
    expect(vpc.pathType).toBe('vpc')
    expect(vpc.mode).toBe('access')

    expect(empty.name).toBe('DB-EPG')
    expect(empty.preferredGroup).toBe(false)
    expect(empty.isolation).toBe(false)
    expect(empty.bindings).toEqual([])
    expect(empty.bridgeDomain).toBe('')
  })

  it('skips non-fvAEPg items and EPGs with unparseable dns', () => {
    const rows = parseEpgRows([
      { somethingElse: { attributes: {} } },
      { fvAEPg: { attributes: { dn: 'uni/tn-weird', name: 'x' } } },
    ])
    expect(rows).toEqual([])
  })
})
