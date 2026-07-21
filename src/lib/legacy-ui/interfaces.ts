import type { Prisma } from '@prisma/client'
import { serializeLegacyCounter } from './serialize'

export type LegacyInterfacePresence = 'all' | 'present' | 'absent'

export interface LegacyInterfaceFilters {
  query?: string
  deviceIds?: string[]
  sites?: string[]
  adminStates?: string[]
  operStates?: string[]
  presence?: LegacyInterfacePresence
}

export interface LegacyInterfaceSampleInput {
  id: string
  collectedAt: Date
  adminSt: string
  operSt: string
  speed: string
  inputErrors: bigint
  outputErrors: bigint
  crcErrors: bigint
  dInputErrors: bigint | null
  dOutputErrors: bigint | null
  dCrcErrors: bigint | null
}

export function buildLegacyInterfaceWhere(
  filters: LegacyInterfaceFilters,
): Prisma.LegacyInterfaceSnapshotWhereInput {
  const and: Prisma.LegacyInterfaceSnapshotWhereInput[] = []
  if (filters.deviceIds?.length) and.push({ deviceId: { in: filters.deviceIds } })
  if (filters.sites?.length) and.push({ device: { site: { in: filters.sites } } })
  if (filters.adminStates?.length) and.push({ adminSt: { in: filters.adminStates } })
  if (filters.operStates?.length) and.push({ operSt: { in: filters.operStates } })
  if (filters.presence === 'present') and.push({ present: true })
  if (filters.presence === 'absent') and.push({ present: false })

  const query = filters.query?.trim()
  if (query) {
    and.push({ OR: [
      { ifName: { contains: query, mode: 'insensitive' } },
      { description: { contains: query, mode: 'insensitive' } },
      { ipAddress: { contains: query, mode: 'insensitive' } },
      { device: { hostname: { contains: query, mode: 'insensitive' } } },
      { device: { managementIp: { contains: query, mode: 'insensitive' } } },
    ] })
  }

  return and.length ? { AND: and } : {}
}

export function serializeLegacyInterfaceSample(sample: LegacyInterfaceSampleInput) {
  return {
    ...sample,
    collectedAt: sample.collectedAt.toISOString(),
    inputErrors: sample.inputErrors.toString(),
    outputErrors: sample.outputErrors.toString(),
    crcErrors: sample.crcErrors.toString(),
    dInputErrors: serializeLegacyCounter(sample.dInputErrors),
    dOutputErrors: serializeLegacyCounter(sample.dOutputErrors),
    dCrcErrors: serializeLegacyCounter(sample.dCrcErrors),
  }
}

export function safeLegacyCounterNumber(value: string | null): number | null {
  if (value === null) return null
  const exact = BigInt(value)
  if (exact > BigInt(Number.MAX_SAFE_INTEGER) || exact < BigInt(Number.MIN_SAFE_INTEGER)) {
    return null
  }
  return Number(exact)
}
