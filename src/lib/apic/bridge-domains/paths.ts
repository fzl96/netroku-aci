import type {
  ParsedBridgeDomainL2Row,
  ParsedBridgeDomainL3Row,
} from './types'

export { buildTenantPath } from '@/lib/apic/common-paths'

const BD_MAC = '00:22:BD:F8:19:FF'

export function buildVrfPath(tenant: string, vrf: string): string {
  return `/api/node/mo/uni/tn-${tenant}/ctx-${vrf}.json`
}

function buildBridgeDomainDn(tenant: string, bd: string): string {
  return `uni/tn-${tenant}/BD-${bd}`
}

export function buildBridgeDomainPath(tenant: string, bd: string): string {
  return `/api/node/mo/${buildBridgeDomainDn(tenant, bd)}.json`
}

export function buildBridgeDomainChildrenPath(tenant: string, bd: string): string {
  return `/api/node/mo/${buildBridgeDomainDn(tenant, bd)}.json?query-target=children`
}

function buildSubnetDn(tenant: string, bd: string, subnet: string): string {
  return `${buildBridgeDomainDn(tenant, bd)}/subnet-[${subnet}]`
}

export function buildSubnetPath(tenant: string, bd: string, subnet: string): string {
  return `/api/node/mo/${buildSubnetDn(tenant, bd, subnet)}.json`
}

export function buildL3OutPath(tenant: string, l3out: string): string {
  return `/api/node/mo/uni/tn-${tenant}/out-${l3out}.json`
}

export function bridgeDomainL2Payload(row: ParsedBridgeDomainL2Row): string {
  const dn = buildBridgeDomainDn(row.tenant, row.bd)
  return JSON.stringify({
    fvBD: {
      attributes: {
        dn,
        unicastRoute: 'no',
        unkMacUcastAct: 'flood',
        arpFlood: 'true',
        mac: BD_MAC,
        name: row.bd,
        descr: row.bd_desc ?? '',
        rn: `BD-${row.bd}`,
        status: 'created,modified',
      },
      children: [
        {
          fvRsCtx: {
            attributes: {
              tnFvCtxName: row.vrf,
              status: 'created,modified',
            },
            children: [],
          },
        },
      ],
    },
  })
}

export function bridgeDomainL3Payload(row: ParsedBridgeDomainL3Row): string {
  const dn = buildBridgeDomainDn(row.tenant, row.bd)
  return JSON.stringify({
    fvBD: {
      attributes: {
        dn,
        unicastRoute: 'yes',
        unkMacUcastAct: 'proxy',
        arpFlood: 'false',
        mac: BD_MAC,
        name: row.bd,
        descr: row.bd_desc ?? '',
        rn: `BD-${row.bd}`,
        status: 'created,modified',
      },
      children: [
        {
          fvRsCtx: {
            attributes: {
              tnFvCtxName: row.vrf,
              status: 'created,modified',
            },
            children: [],
          },
        },
      ],
    },
  })
}

export function subnetPayload(row: ParsedBridgeDomainL3Row): string {
  const dn = buildSubnetDn(row.tenant, row.bd, row.subnet)
  return JSON.stringify({
    fvSubnet: {
      attributes: {
        dn,
        ctrl: '',
        ip: row.subnet,
        scope: 'public',
        rn: `subnet-[${row.subnet}]`,
        status: 'created,modified',
      },
      children: [],
    },
  })
}

export function l3OutAttachmentPayload(row: ParsedBridgeDomainL3Row): string {
  return JSON.stringify({
    fvRsBDToOut: {
      attributes: {
        tnL3extOutName: row.l3out,
        status: 'created,modified',
      },
      children: [],
    },
  })
}

export function bridgeDomainDeletePayload(row: { tenant: string; bd: string }): string {
  return JSON.stringify({
    fvBD: {
      attributes: {
        dn: buildBridgeDomainDn(row.tenant, row.bd),
        status: 'deleted',
      },
      children: [],
    },
  })
}
