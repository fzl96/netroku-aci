import type { ParsedAnyEpgRow, ParsedEpgContractRow } from './types'

export type EpgChild =
  | { fvRsBd: { attributes: { tDn?: string; tnFvBDName?: string } } }
  | { fvRsCons: { attributes: { tDn?: string; tnVzBrCPName?: string } } }
  | { fvRsProv: { attributes: { tDn?: string; tnVzBrCPName?: string } } }

function relationTargetName(value: string | undefined, marker: string): string | undefined {
  return value?.split(marker)[1]
}

export function epgBridgeDomainName(children: EpgChild[]): string | undefined {
  const bd = children.find((item): item is { fvRsBd: { attributes: { tDn?: string; tnFvBDName?: string } } } =>
    'fvRsBd' in item
  )
  return bd?.fvRsBd.attributes.tnFvBDName ?? relationTargetName(bd?.fvRsBd.attributes.tDn, '/BD-')
}

export function hasAnyContract(children: EpgChild[], contract: string): boolean {
  return children.some((item) => {
    if ('fvRsCons' in item) {
      return (item.fvRsCons.attributes.tnVzBrCPName ?? relationTargetName(item.fvRsCons.attributes.tDn, '/brc-')) === contract
    }
    if ('fvRsProv' in item) {
      return (item.fvRsProv.attributes.tnVzBrCPName ?? relationTargetName(item.fvRsProv.attributes.tDn, '/brc-')) === contract
    }
    return false
  })
}

export function hasRoleContract(
  children: EpgChild[],
  contract: string,
  role: 'consumer' | 'provider',
): boolean {
  return children.some((item) => {
    if (role === 'consumer' && 'fvRsCons' in item) {
      return (item.fvRsCons.attributes.tnVzBrCPName ?? relationTargetName(item.fvRsCons.attributes.tDn, '/brc-')) === contract
    }
    if (role === 'provider' && 'fvRsProv' in item) {
      return (item.fvRsProv.attributes.tnVzBrCPName ?? relationTargetName(item.fvRsProv.attributes.tDn, '/brc-')) === contract
    }
    return false
  })
}

export function validateEpgState(row: ParsedAnyEpgRow, children: EpgChild[]): string | null {
  const existingBd = epgBridgeDomainName(children)
  if (existingBd && existingBd !== row.bd) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is attached to BD ${existingBd}, not ${row.bd}`
  }
  if (!existingBd) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is missing BD attachment ${row.bd}`
  }

  return null
}

export function validateEpgRollbackState(row: ParsedEpgContractRow, children: EpgChild[]): string | null {
  const stateError = validateEpgState(row, children)
  if (stateError) return stateError

  if (!hasAnyContract(children, row.contract)) {
    return `EPG ${row.tenant}/${row.anp}/${row.epg} is missing consumed/provided contract ${row.contract}`
  }

  return null
}
