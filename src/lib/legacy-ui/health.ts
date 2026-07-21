import type { Prisma } from '@prisma/client'

export interface LegacyHealthFilters {
  query?: string
  sites?: string[]
}

export interface LegacyHealthSampleInput {
  id: string
  collectedAt: Date
  uptime: string
  cpuPercent: number | null
  memoryPercent: number | null
  storagePercent: number | null
  temperatureCelsius: number | null
  fanStatuses: string[]
  psuStatuses: string[]
}

export function buildLegacyHealthDeviceWhere(
  filters: LegacyHealthFilters,
): Prisma.LegacyDeviceWhereInput {
  const and: Prisma.LegacyDeviceWhereInput[] = [{ healthSamples: { some: {} } }]
  if (filters.sites?.length) and.push({ site: { in: filters.sites } })
  const query = filters.query?.trim()
  if (query) {
    and.push({ OR: [
      { hostname: { contains: query, mode: 'insensitive' } },
      { site: { contains: query, mode: 'insensitive' } },
      { managementIp: { contains: query, mode: 'insensitive' } },
    ] })
  }
  return { AND: and }
}

export function legacyStatusText(statuses: string[]): string {
  return statuses.length ? statuses.join(', ') : 'Not reported'
}

export function serializeLegacyHealthSample(sample: LegacyHealthSampleInput) {
  return {
    ...sample,
    collectedAt: sample.collectedAt.toISOString(),
  }
}
