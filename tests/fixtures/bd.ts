import type { BdRow } from '../../src/lib/bds/types'

export function bdFixture(overrides: Partial<BdRow> = {}): BdRow {
  return {
    id: 'bd-1',
    apicHostId: 'h1',
    dn: 'uni/tn-common/BD-web',
    name: 'web',
    tenant: 'common',
    description: 'Web network',
    vrf: 'VRF',
    vrfDn: 'uni/tn-common/ctx-VRF',
    unicastRoute: true,
    arpFlood: false,
    ipLearning: true,
    limitIpLearnToSubnets: false,
    unkMacUcastAct: 'proxy',
    unkMcastAct: 'flood',
    multiDstPktAct: 'bd-flood',
    l3Outs: ['WAN', 'DMZ'],
    subnets: [
      {
        ip: '10.0.0.1/24',
        description: 'Gateway',
        scope: 'public,shared',
        preferred: true,
        ctrl: '',
        ipDPLearning: 'enabled',
      },
      {
        ip: '2001:db8::1/64',
        description: '',
        scope: 'private',
        preferred: false,
        ctrl: '',
        ipDPLearning: 'disabled',
      },
    ],
    epgs: [{ dn: 'uni/tn-T1/ap-app/epg-web', tenant: 'T1', appProfile: 'app', name: 'web' }],
    epgCount: 1,
    ...overrides,
  }
}
