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

export function countActiveEndpointFilterGroups(filters: EndpointFilters): number {
  return [filters.vlan, filters.node, filters.iface, filters.status]
    .filter(values => values && values.length > 0)
    .length
}

export function buildEndpointWhere(
  apicHostId: string,
  filters: EndpointFilters,
): Prisma.EndpointWhereInput {
  const query = filters.query?.trim()

  return {
    apicHostId,
    ...(filters.vlan?.length ? { vlan: { in: filters.vlan } } : {}),
    ...(filters.node?.length ? { node: { in: filters.node } } : {}),
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
