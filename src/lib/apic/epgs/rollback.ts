import {
  effectiveBridgeDomainTenant,
  effectiveContractTenant,
  type ParsedAnyEpgRow,
  type ParsedEpgContractRow,
} from './types'

export type EpgChild =
  | { fvRsBd: { attributes: { tDn?: string; tnFvBDName?: string } } }
  | { fvRsCons: { attributes: { tDn?: string; tnVzBrCPName?: string } } }
  | { fvRsProv: { attributes: { tDn?: string; tnVzBrCPName?: string } } }
  | { fvRsDomAtt: { attributes: { tDn?: string } } }

function relationTargetName(value: string | undefined, marker: string): string | undefined {
  return value?.split(marker)[1]
}

function relationTargetTenant(value: string | undefined): string | undefined {
  return value?.match(/^uni\/tn-([^/]+)\//)?.[1]
}

function epgBridgeDomainTarget(children: EpgChild[]): { name?: string; tenant?: string } {
  const bd = children.find((item): item is { fvRsBd: { attributes: { tDn?: string; tnFvBDName?: string } } } =>
    'fvRsBd' in item
  )
  const tDn = bd?.fvRsBd.attributes.tDn
  return {
    name: bd?.fvRsBd.attributes.tnFvBDName ?? relationTargetName(tDn, '/BD-'),
    tenant: relationTargetTenant(tDn),
  }
}

export function epgBridgeDomainName(children: EpgChild[]): string | undefined {
  return epgBridgeDomainTarget(children).name
}

function relationMatches(
  tDn: string | undefined,
  fallbackName: string | undefined,
  marker: string,
  expectedName: string,
  expectedTenant?: string,
): boolean {
  const name = fallbackName ?? relationTargetName(tDn, marker)
  const tenant = relationTargetTenant(tDn)
  return name === expectedName && (!tenant || !expectedTenant || tenant === expectedTenant)
}

export function hasAnyContract(children: EpgChild[], contract: string, contractTenant?: string): boolean {
  return children.some((item) => {
    if ('fvRsCons' in item) {
      return relationMatches(item.fvRsCons.attributes.tDn, item.fvRsCons.attributes.tnVzBrCPName, '/brc-', contract, contractTenant)
    }
    if ('fvRsProv' in item) {
      return relationMatches(item.fvRsProv.attributes.tDn, item.fvRsProv.attributes.tnVzBrCPName, '/brc-', contract, contractTenant)
    }
    return false
  })
}

export function hasRoleContract(
  children: EpgChild[],
  contract: string,
  role: 'consumer' | 'provider',
  contractTenant?: string,
): boolean {
  return children.some((item) => {
    if (role === 'consumer' && 'fvRsCons' in item) {
      return relationMatches(item.fvRsCons.attributes.tDn, item.fvRsCons.attributes.tnVzBrCPName, '/brc-', contract, contractTenant)
    }
    if (role === 'provider' && 'fvRsProv' in item) {
      return relationMatches(item.fvRsProv.attributes.tDn, item.fvRsProv.attributes.tnVzBrCPName, '/brc-', contract, contractTenant)
    }
    return false
  })
}

export function hasPhysicalDomain(children: EpgChild[], physDomain: string): boolean {
  return children.some((item) => {
    if ('fvRsDomAtt' in item) {
      return relationTargetName(item.fvRsDomAtt.attributes.tDn, 'uni/phys-') === physDomain
    }
    return false
  })
}

export function validateEpgState(row: ParsedAnyEpgRow, children: EpgChild[]): string | null {
  const existing = epgBridgeDomainTarget(children)
  const existingBd = existing.name
  const expectedBdTenant = effectiveBridgeDomainTenant(row)
  if (existingBd && existingBd !== row.bd) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is attached to BD ${existingBd}, not ${row.bd}`
  }
  if (existingBd && existing.tenant && existing.tenant !== expectedBdTenant) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is attached to BD ${existing.tenant}/${existingBd}, not ${expectedBdTenant}/${row.bd}`
  }
  if (!existingBd) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is missing BD attachment ${row.bd}`
  }

  return null
}

export function validateEpgRollbackState(row: ParsedEpgContractRow, children: EpgChild[]): string | null {
  const stateError = validateEpgState(row, children)
  if (stateError) return stateError

  if (!hasAnyContract(children, row.contract, effectiveContractTenant(row))) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is missing consumed/provided contract ${row.contract}`
  }

  return null
}
