import type { EpgContractRole, ParsedAnyEpgRow, ParsedEpgContractRow } from './types'

export function buildTenantPath(tenant: string): string {
  return `/api/node/mo/uni/tn-${tenant}.json`
}

export function buildAppProfilePath(tenant: string, anp: string): string {
  return `/api/node/mo/uni/tn-${tenant}/ap-${anp}.json`
}

export function buildBridgeDomainPath(tenant: string, bd: string): string {
  return `/api/node/mo/uni/tn-${tenant}/BD-${bd}.json`
}

export function buildContractPath(tenant: string, contract: string): string {
  return `/api/node/mo/uni/tn-${tenant}/brc-${contract}.json`
}

export function buildEpgDn(row: Pick<ParsedAnyEpgRow, 'tenant' | 'anp' | 'epg'>): string {
  return `uni/tn-${row.tenant}/ap-${row.anp}/epg-${row.epg}`
}

export function buildEpgPath(row: Pick<ParsedAnyEpgRow, 'tenant' | 'anp' | 'epg'>): string {
  return `/api/node/mo/${buildEpgDn(row)}.json`
}

export function buildEpgChildrenPath(row: Pick<ParsedAnyEpgRow, 'tenant' | 'anp' | 'epg'>): string {
  return `/api/node/mo/${buildEpgDn(row)}.json?query-target=children`
}

export function epgPayload(row: ParsedAnyEpgRow): string {
  const dn = buildEpgDn(row)
  return JSON.stringify({
    fvAEPg: {
      attributes: {
        dn,
        prio: 'level3',
        descr: row.epg_desc ?? '',
        name: row.epg,
        rn: `epg-${row.epg}`,
        status: 'created,modified',
      },
      children: [
        {
          fvRsBd: {
            attributes: {
              tnFvBDName: row.bd,
              status: 'created,modified',
            },
            children: [],
          },
        },
      ],
    },
  })
}

export function contractAttachmentPayload(row: ParsedEpgContractRow, role: EpgContractRole): string {
  const relation = role === 'consumer' ? 'fvRsCons' : 'fvRsProv'
  return JSON.stringify({
    [relation]: {
      attributes: {
        tnVzBrCPName: row.contract,
        status: 'created,modified',
      },
      children: [],
    },
  })
}

export function buildContractRelationDn(row: ParsedEpgContractRow, role: EpgContractRole): string {
  return `${buildEpgDn(row)}/${role === 'consumer' ? 'rscons' : 'rsprov'}-${row.contract}`
}

export function buildContractRelationPath(row: ParsedEpgContractRow, role: EpgContractRole): string {
  return `/api/node/mo/${buildContractRelationDn(row, role)}.json`
}

export function contractRelationDeletePayload(row: ParsedEpgContractRow, role: EpgContractRole): string {
  const relation = role === 'consumer' ? 'fvRsCons' : 'fvRsProv'
  return JSON.stringify({
    [relation]: {
      attributes: {
        dn: buildContractRelationDn(row, role),
        status: 'deleted',
      },
      children: [],
    },
  })
}

export function epgDeletePayload(row: Pick<ParsedAnyEpgRow, 'tenant' | 'anp' | 'epg'>): string {
  return JSON.stringify({
    fvAEPg: {
      attributes: {
        dn: buildEpgDn(row),
        status: 'deleted',
      },
      children: [],
    },
  })
}
