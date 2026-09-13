import {
  effectiveEpgAnp,
  type EsgContractRole,
  type EsgRef,
  type EsgSelectorRow,
  type ParsedEsgRow,
} from './types'

export { buildTenantPath } from '@/lib/apic/common-paths'
export { buildAppProfilePath, buildContractPath } from '@/lib/apic/epgs/paths'
export { buildBridgeDomainChildrenPath, buildVrfPath } from '@/lib/apic/bridge-domains/paths'

export function buildEsgDn(ref: EsgRef): string {
  return `uni/tn-${ref.tenant}/ap-${ref.anp}/esg-${ref.esg}`
}

export function buildEsgPath(ref: EsgRef): string {
  return `/api/node/mo/${buildEsgDn(ref)}.json`
}

export function buildEsgChildrenPath(ref: EsgRef): string {
  return `/api/node/mo/${buildEsgDn(ref)}.json?query-target=children`
}

/** Children path for an ESG identified by its full DN, e.g. one found by a class query. */
export function buildEsgChildrenPathFromDn(dn: string): string {
  return `/api/node/mo/${dn}.json?query-target=children`
}

export function buildSelectedEpgDn(
  row: Pick<EsgSelectorRow, 'tenant' | 'anp' | 'epg_anp' | 'selector_value'>,
): string {
  return `uni/tn-${row.tenant}/ap-${effectiveEpgAnp(row)}/epg-${row.selector_value}`
}

export function buildEpgPathFromDn(dn: string): string {
  return `/api/node/mo/${dn}.json`
}

export function buildEpgChildrenPathFromDn(dn: string): string {
  return `/api/node/mo/${dn}.json?query-target=children`
}

export function ipMatchExpression(ip: string): string {
  return `ip=='${ip}'`
}

export function buildSelectorDn(row: EsgSelectorRow): string {
  const esgDn = buildEsgDn(row)
  return row.selector_type === 'epg'
    ? `${esgDn}/epgselector-[${buildSelectedEpgDn(row)}]`
    : `${esgDn}/epselector-[${ipMatchExpression(row.selector_value)}]`
}

/** Every EPG selector in the fabric that selects the given EPG. */
export function buildEpgSelectorClassPath(epgDn: string): string {
  return `/api/class/fvEPgSelector.json?query-target-filter=eq(fvEPgSelector.matchEpgDn,"${epgDn}")`
}

/**
 * IP selectors whose expression mentions the address. The wildcard match is loose
 * (dots match any character), so callers must re-check the parsed expression.
 */
export function buildIpSelectorClassPath(ip: string): string {
  return `/api/class/fvEPSelector.json?query-target-filter=wcard(fvEPSelector.matchExpression,"${ip}")`
}

export function esgPayload(row: ParsedEsgRow): string {
  return JSON.stringify({
    fvESg: {
      attributes: {
        dn: buildEsgDn(row),
        name: row.esg,
        descr: row.esg_desc ?? '',
        rn: `esg-${row.esg}`,
        status: 'created,modified',
      },
      children: [
        {
          fvRsScope: {
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

export function contractAttachmentPayload(role: EsgContractRole, contract: string): string {
  const relation = role === 'consumer' ? 'fvRsCons' : 'fvRsProv'
  return JSON.stringify({
    [relation]: {
      attributes: {
        tnVzBrCPName: contract,
        status: 'created,modified',
      },
      children: [],
    },
  })
}

export function esgDeletePayload(ref: EsgRef): string {
  return JSON.stringify({
    fvESg: {
      attributes: {
        dn: buildEsgDn(ref),
        status: 'deleted',
      },
      children: [],
    },
  })
}

export function selectorPayload(row: EsgSelectorRow): string {
  const dn = buildSelectorDn(row)
  const descr = row.selector_desc ?? ''
  if (row.selector_type === 'epg') {
    return JSON.stringify({
      fvEPgSelector: {
        attributes: {
          dn,
          matchEpgDn: buildSelectedEpgDn(row),
          descr,
          status: 'created,modified',
        },
        children: [],
      },
    })
  }
  return JSON.stringify({
    fvEPSelector: {
      attributes: {
        dn,
        matchExpression: ipMatchExpression(row.selector_value),
        descr,
        status: 'created,modified',
      },
      children: [],
    },
  })
}

export function selectorDeletePayload(row: EsgSelectorRow): string {
  const className = row.selector_type === 'epg' ? 'fvEPgSelector' : 'fvEPSelector'
  return JSON.stringify({
    [className]: {
      attributes: {
        dn: buildSelectorDn(row),
        status: 'deleted',
      },
      children: [],
    },
  })
}
