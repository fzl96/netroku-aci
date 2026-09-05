import type { Prisma } from '@prisma/client'

export interface LegacyDeviceFilters {
  query?: string
  sites?: string[]
  deviceTypes?: string[]
}

export function buildLegacyDeviceWhere(
  filters: LegacyDeviceFilters,
): Prisma.LegacyDeviceWhereInput {
  const and: Prisma.LegacyDeviceWhereInput[] = []
  if (filters.sites?.length) and.push({ site: { in: filters.sites } })
  if (filters.deviceTypes?.length) and.push({ deviceType: { in: filters.deviceTypes } })
  const query = filters.query?.trim()
  if (query) {
    and.push({
      OR: [
        { site: { contains: query, mode: 'insensitive' } },
        { hostname: { contains: query, mode: 'insensitive' } },
        { managementIp: { contains: query, mode: 'insensitive' } },
        { deviceType: { contains: query, mode: 'insensitive' } },
        { vendor: { contains: query, mode: 'insensitive' } },
        { model: { contains: query, mode: 'insensitive' } },
        { serialNumber: { contains: query, mode: 'insensitive' } },
        { softwareVersion: { contains: query, mode: 'insensitive' } },
        { location: { contains: query, mode: 'insensitive' } },
      ],
    })
  }
  return and.length ? { AND: and } : {}
}

/** Inventory reads as an alphabetical roster, so hostname leads and the id
 *  keeps paging stable across duplicate hostnames. */
export const LEGACY_DEVICE_ORDER_BY: Prisma.LegacyDeviceOrderByWithRelationInput[] = [
  { hostname: 'asc' },
  { id: 'asc' },
]
