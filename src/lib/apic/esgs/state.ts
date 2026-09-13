import type { EsgContractRole, EsgSelectorRow } from './types'
import { buildSelectedEpgDn } from './paths'

type RelationAttrs = { attributes: { tDn?: string; tnVzBrCPName?: string } }

export type EsgChild =
  | { fvRsScope: { attributes: { tDn?: string; tnFvCtxName?: string } } }
  | { fvRsCons: RelationAttrs }
  | { fvRsProv: RelationAttrs }
  | { fvEPgSelector: { attributes: { dn?: string; matchEpgDn?: string } } }
  | { fvEPSelector: { attributes: { dn?: string; matchExpression?: string } } }
  | { fvTagSelector: { attributes: { dn?: string; matchKey?: string; matchValue?: string } } }

export interface EsgAttrs {
  dn?: string
  descr?: string
  name?: string
}

export interface VrfRef {
  name: string
  tenant?: string
}

export interface ContractRef {
  role: EsgContractRole
  contract: string
}

function tenantFromDn(dn: string | undefined): string | undefined {
  return dn?.match(/^uni\/tn-([^/]+)\//)?.[1]
}

/** VRF from an fvRsScope (ESG) or fvRsCtx (BD) relation. */
export function vrfFromRelation(
  attributes: { tDn?: string; tnFvCtxName?: string } | undefined,
): VrfRef | undefined {
  if (!attributes) return undefined
  const name = attributes.tnFvCtxName || attributes.tDn?.split('/ctx-')[1]
  if (!name) return undefined
  return { name, tenant: tenantFromDn(attributes.tDn) }
}

export function esgVrf(children: EsgChild[]): VrfRef | undefined {
  const scope = children.find(
    (item): item is Extract<EsgChild, { fvRsScope: unknown }> => 'fvRsScope' in item,
  )
  return vrfFromRelation(scope?.fvRsScope.attributes)
}

/** Names must match; tenants only count when both sides report one. */
export function sameVrf(a: VrfRef, b: VrfRef): boolean {
  return a.name === b.name && (!a.tenant || !b.tenant || a.tenant === b.tenant)
}

function relationName(relation: RelationAttrs): string | undefined {
  return relation.attributes.tnVzBrCPName || relation.attributes.tDn?.split('/brc-')[1]
}

export function esgContracts(children: EsgChild[]): (ContractRef & { tenant?: string })[] {
  const result: (ContractRef & { tenant?: string })[] = []
  for (const item of children) {
    const [role, relation] =
      'fvRsCons' in item
        ? (['consumer', item.fvRsCons] as const)
        : 'fvRsProv' in item
          ? (['provider', item.fvRsProv] as const)
          : [undefined, undefined]
    if (!role || !relation) continue
    const contract = relationName(relation)
    if (contract) result.push({ role, contract, tenant: tenantFromDn(relation.attributes.tDn) })
  }
  return result
}

export function hasContract(
  children: EsgChild[],
  { role, contract }: ContractRef,
  contractTenant?: string,
): boolean {
  return esgContracts(children).some(
    (item) =>
      item.role === role &&
      item.contract === contract &&
      (!item.tenant || !contractTenant || item.tenant === contractTenant),
  )
}

export function requestedContracts(row: {
  consContracts: string[]
  provContracts: string[]
}): ContractRef[] {
  return [
    ...row.consContracts.map((contract) => ({ role: 'consumer' as const, contract })),
    ...row.provContracts.map((contract) => ({ role: 'provider' as const, contract })),
  ]
}

/** Contracts attached on APIC that the CSV row does not list. */
export function extraContracts(
  children: EsgChild[],
  row: { consContracts: string[]; provContracts: string[] },
): ContractRef[] {
  const requested = new Set(requestedContracts(row).map((c) => `${c.role}|${c.contract}`))
  return esgContracts(children)
    .filter((c) => !requested.has(`${c.role}|${c.contract}`))
    .map(({ role, contract }) => ({ role, contract }))
}

export function formatContracts(contracts: ContractRef[]): string {
  const consumed = contracts.filter((c) => c.role === 'consumer').map((c) => c.contract)
  const provided = contracts.filter((c) => c.role === 'provider').map((c) => c.contract)
  return [
    consumed.length > 0 && `consumed ${consumed.join(', ')}`,
    provided.length > 0 && `provided ${provided.join(', ')}`,
  ]
    .filter(Boolean)
    .join('; ')
}

export function selectorCount(children: EsgChild[]): number {
  return children.filter(
    (item) => 'fvEPgSelector' in item || 'fvEPSelector' in item || 'fvTagSelector' in item,
  ).length
}

/** Extracts the address from an expression like ip=='10.1.1.0/24'. Returns undefined for anything else. */
export function parseIpMatchExpression(expression: string | undefined): string | undefined {
  return expression?.trim().match(/^ip\s*==\s*'([^']+)'$/)?.[1]
}

export function hasSelector(children: EsgChild[], row: EsgSelectorRow): boolean {
  if (row.selector_type === 'epg') {
    const epgDn = buildSelectedEpgDn(row)
    return children.some(
      (item) => 'fvEPgSelector' in item && item.fvEPgSelector.attributes.matchEpgDn === epgDn,
    )
  }
  return children.some(
    (item) =>
      'fvEPSelector' in item &&
      parseIpMatchExpression(item.fvEPSelector.attributes.matchExpression) === row.selector_value,
  )
}

/** Parent ESG DN of a selector DN, e.g. uni/tn-A/ap-B/esg-C/epselector-[...] -> uni/tn-A/ap-B/esg-C. */
export function parentEsgDn(selectorDn: string | undefined): string | undefined {
  return selectorDn?.match(/^(uni\/tn-[^/]+\/ap-[^/]+\/esg-[^/]+)\//)?.[1]
}

export function validateEsgVrf(
  label: string,
  expectedVrf: string,
  children: EsgChild[],
): string | null {
  const existing = esgVrf(children)
  if (existing && existing.name !== expectedVrf) {
    return `ESG ${label} exists with VRF ${existing.name}, not ${expectedVrf}`
  }
  return null
}
