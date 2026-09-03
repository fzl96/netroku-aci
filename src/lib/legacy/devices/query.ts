import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeLegacyDate } from '@/lib/legacy/serialize'
import type { LegacyPageSize } from '@/lib/legacy/query'
import { buildLegacyDeviceWhere, legacyDeviceOrderBy } from './filters'
import type { LegacyDevicePageParams } from './params'

const LEGACY_DEVICE_CACHE_SECONDS = 28_800
const LEGACY_DEVICE_TAG = 'legacy-devices:all'

const DEVICE_SELECT = {
  id: true,
  site: true,
  hostname: true,
  managementIp: true,
  deviceType: true,
  vendor: true,
  model: true,
  serialNumber: true,
  softwareVersion: true,
  location: true,
  active: true,
  firstSeenAt: true,
  lastSeenAt: true,
  lastHealthSyncAt: true,
  lastInterfaceSyncAt: true,
  lastEndpointSyncAt: true,
} satisfies Prisma.LegacyDeviceSelect

type StoredLegacyDevice = Prisma.LegacyDeviceGetPayload<{ select: typeof DEVICE_SELECT }>

export type LegacyDeviceRow = {
  id: string
  site: string
  hostname: string
  managementIp: string
  deviceType: string
  vendor: string | null
  model: string | null
  serialNumber: string | null
  softwareVersion: string | null
  location: string | null
  active: boolean
  firstSeenAt: string
  lastSeenAt: string
  lastHealthSyncAt: string | null
  lastInterfaceSyncAt: string | null
  lastEndpointSyncAt: string | null
}

export type LegacyDeviceSummary = {
  total: number
  sites: number
  withHealth: number
  incomplete: number
}

export type LegacyDeviceFilterOptions = {
  siteOptions: string[]
  typeOptions: string[]
}

export type LegacyDeviceResults = {
  rows: LegacyDeviceRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
}

export type LegacyDeviceReadErrorCode = 'unauthorized' | 'read-failed'

export class LegacyDeviceReadError extends Error {
  constructor(
    readonly code: LegacyDeviceReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load legacy devices', options)
    this.name = 'LegacyDeviceReadError'
  }
}

async function authorize(): Promise<void> {
  try { await requireSession() }
  catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new LegacyDeviceReadError()
  }
}

async function readDeviceData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof LegacyDeviceReadError) throw error
    throw new LegacyDeviceReadError('read-failed', { cause: error })
  }
}

const cacheOptions = {
  tags: [LEGACY_DEVICE_TAG],
  revalidate: LEGACY_DEVICE_CACHE_SECONDS,
}

function serializeDevice(record: StoredLegacyDevice): LegacyDeviceRow {
  return {
    id: record.id,
    site: record.site,
    hostname: record.hostname,
    managementIp: record.managementIp,
    deviceType: record.deviceType,
    vendor: record.vendor,
    model: record.model,
    serialNumber: record.serialNumber,
    softwareVersion: record.softwareVersion,
    location: record.location,
    active: record.active,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    lastHealthSyncAt: serializeLegacyDate(record.lastHealthSyncAt),
    lastInterfaceSyncAt: serializeLegacyDate(record.lastInterfaceSyncAt),
    lastEndpointSyncAt: serializeLegacyDate(record.lastEndpointSyncAt),
  }
}

export async function getLegacyDeviceSummary(): Promise<LegacyDeviceSummary> {
  await authorize()
  return readDeviceData(() => unstable_cache(async () => {
    const [total, siteRows, withHealth, incomplete] = await Promise.all([
      prisma.legacyDevice.count(),
      prisma.legacyDevice.findMany({ distinct: ['site'], select: { site: true } }),
      prisma.legacyDevice.count({ where: { lastHealthSyncAt: { not: null } } }),
      prisma.legacyDevice.count({ where: { OR: [
        { lastHealthSyncAt: null },
        { lastInterfaceSyncAt: null },
        { lastEndpointSyncAt: null },
      ] } }),
    ])
    return { total, sites: siteRows.length, withHealth, incomplete }
  }, ['legacy-devices', 'summary'], cacheOptions)())
}

export async function getLegacyDeviceFilterOptions(): Promise<LegacyDeviceFilterOptions> {
  await authorize()
  return readDeviceData(() => unstable_cache(async () => {
    const [siteRows, typeRows] = await Promise.all([
      prisma.legacyDevice.findMany({
        distinct: ['site'], select: { site: true }, orderBy: { site: 'asc' },
      }),
      prisma.legacyDevice.findMany({
        distinct: ['deviceType'], select: { deviceType: true }, orderBy: { deviceType: 'asc' },
      }),
    ])
    return {
      siteOptions: siteRows.map(row => row.site),
      typeOptions: typeRows.map(row => row.deviceType),
    }
  }, ['legacy-devices', 'filter-options'], cacheOptions)())
}

export async function getLegacyDeviceResults(
  params: LegacyDevicePageParams,
): Promise<LegacyDeviceResults> {
  await authorize()
  return readDeviceData(() => unstable_cache(async (): Promise<LegacyDeviceResults> => {
    const where = buildLegacyDeviceWhere({
      query: params.query,
      sites: params.site ? [params.site] : [],
      deviceTypes: params.deviceType ? [params.deviceType] : [],
    })
    const [records, total] = await Promise.all([
      prisma.legacyDevice.findMany({
        where,
        orderBy: legacyDeviceOrderBy(params.sort, params.direction),
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        select: DEVICE_SELECT,
      }),
      prisma.legacyDevice.count({ where }),
    ])
    return {
      rows: records.map(serializeDevice),
      total,
      page: params.page,
      pageSize: params.pageSize,
    }
  }, [
    'legacy-devices', 'results', params.query, params.site, params.deviceType,
    params.sort, params.direction, String(params.page), String(params.pageSize),
  ], cacheOptions)())
}
