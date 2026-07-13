import type { Prisma } from '@prisma/client'

export type EndpointStatusFilter = 'active' | 'historical'

export interface EndpointFilters {
  query?: string
  vlan?: string[]
  node?: string[]
  iface?: string[]
  status?: EndpointStatusFilter[]
}

export function hasActiveEndpointFilters(filters: EndpointFilters): boolean {
  return Boolean(
    filters.query?.trim()
    || filters.vlan?.length
    || filters.node?.length
    || filters.iface?.length
    || filters.status?.length,
  )
}

export function countActiveEndpointFilterGroups(filters: EndpointFilters, view: 'endpoint' | 'port' = 'endpoint'): number {
  const groups = view === 'endpoint'
    ? [filters.vlan, filters.node, filters.iface, filters.status]
    : [filters.vlan, filters.node, filters.status]

  return groups.filter(values => values && values.length > 0).length
}

/** OR-conditions matching an exact node or either member of a vPC pair. */
function nodeConditions(value: string): Prisma.EndpointWhereInput[] {
  return [
    { node: value },
    { node: { startsWith: `${value}-` } },
    { node: { endsWith: `-${value}` } },
  ]
}

export function buildEndpointWhere(
  apicHostId: string,
  filters: EndpointFilters,
): Prisma.EndpointWhereInput {
  const query = filters.query?.trim()

  return {
    apicHostId,
    ...(filters.vlan?.length ? { vlan: { in: filters.vlan } } : {}),
    ...(filters.node?.length
      ? { AND: [{ OR: filters.node.flatMap(nodeConditions) }] }
      : {}),
    ...(filters.iface?.length ? { interface: { in: filters.iface } } : {}),
    ...(filters.status?.length === 1 ? { isActive: filters.status[0] === 'active' } : {}),
    ...(query
      ? {
          OR: [
            { mac: { contains: query, mode: 'insensitive' } },
            { ip: { contains: query, mode: 'insensitive' } },
            { vlan: { contains: query, mode: 'insensitive' } },
            { node: { contains: query, mode: 'insensitive' } },
            { interface: { contains: query, mode: 'insensitive' } },
            { epgDescr: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Distinct stored node values ("3101", "3101-3102") → individual leaf options ("3101", "3102"). */
export function expandNodeOptions(values: string[]): string[] {
  const leaves = new Set<string>()
  for (const value of values) {
    for (const leaf of value.split('-')) {
      if (leaf) leaves.add(leaf)
    }
  }
  return Array.from(leaves).sort((a, b) => NATURAL_COLLATOR.compare(a, b))
}
