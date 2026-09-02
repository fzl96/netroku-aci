import type { Prisma } from '@prisma/client'

export type LegacyEndpointStatus = 'active' | 'historical'

export interface LegacyEndpointFilters {
  query?: string
  deviceIds?: string[]
  sites?: string[]
  vlans?: string[]
  interfaces?: string[]
  statuses?: LegacyEndpointStatus[]
}

export function buildLegacyEndpointWhere(
  filters: LegacyEndpointFilters,
): Prisma.LegacyEndpointWhereInput {
  const and: Prisma.LegacyEndpointWhereInput[] = []
  if (filters.deviceIds?.length) and.push({ deviceId: { in: filters.deviceIds } })
  if (filters.sites?.length) and.push({ device: { site: { in: filters.sites } } })
  if (filters.vlans?.length) and.push({ vlan: { in: filters.vlans } })
  if (filters.interfaces?.length) and.push({ interface: { in: filters.interfaces } })
  if (filters.statuses?.length === 1) and.push({ isActive: filters.statuses[0] === 'active' })

  const query = filters.query?.trim()
  if (query) {
    and.push({ OR: [
      { mac: { contains: query, mode: 'insensitive' } },
      { ip: { contains: query, mode: 'insensitive' } },
      { vlan: { contains: query, mode: 'insensitive' } },
      { vlanName: { contains: query, mode: 'insensitive' } },
      { interface: { contains: query, mode: 'insensitive' } },
      { learningType: { contains: query, mode: 'insensitive' } },
      { device: { hostname: { contains: query, mode: 'insensitive' } } },
      { device: { managementIp: { contains: query, mode: 'insensitive' } } },
    ] })
  }

  return and.length ? { AND: and } : {}
}

const SORT_FIELDS = {
  mac: 'mac',
  vlan: 'vlan',
  interface: 'interface',
  firstSeen: 'firstSeenAt',
  lastSeen: 'lastSeenAt',
  cleared: 'clearedAt',
} as const

export function legacyEndpointOrderBy(
  sort: string | undefined,
  direction: 'asc' | 'desc',
): Prisma.LegacyEndpointOrderByWithRelationInput[] {
  const field = SORT_FIELDS[sort as keyof typeof SORT_FIELDS]
  return field
    ? [{ [field]: direction }, { id: 'asc' }]
    : [{ lastSeenAt: 'desc' }, { id: 'asc' }]
}
