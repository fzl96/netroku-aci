import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  legacyRangeCutoff,
  parseLegacyRange,
  type LegacyPageSize,
  type LegacyRange,
} from '@/lib/legacy/query'
import { buildLegacyInterfaceWhere, serializeLegacyInterfaceSample } from './filters'
import { sortLegacyInterfaceRows, sumLegacyCrcByInterface } from './list-data'
import type { LegacyInterfaceListState } from './params'
import { queryLegacyStateChangedInterfaceIds } from './state-change-query'

const LEGACY_INTERFACE_CACHE_SECONDS = 28_800
const LEGACY_INTERFACE_TAG = 'legacy-interfaces:all'
const HISTORY_PAGE_SIZE = 25
const CHART_POINT_LIMIT = 300

export type LegacyInterfaceSampleView = ReturnType<typeof serializeLegacyInterfaceSample>

export type LegacyInterfaceRow = {
  id: string
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  ifName: string
  description: string
  ipAddress: string | null
  prefixLength: number | null
  mtu: number | null
  speed: string
  adminSt: string
  operSt: string
  present: boolean
  firstSeenAt: string
  lastSeenAt: string
  crcWindowTotal: string | null
  sample: LegacyInterfaceSampleView | null
}

export type LegacyInterfaceSummary = {
  total: number
  down: number
  absent: number
  withHistory: number
}

export type LegacyInterfaceDeviceOption = { id: string; hostname: string; site: string }
export type LegacyInterfaceFilterOptions = { devices: LegacyInterfaceDeviceOption[] }

export type LegacyInterfaceResults = {
  rows: LegacyInterfaceRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
}

export type LegacyInterfaceHistory = {
  snapshot: {
    id: string
    ifName: string
    description: string
    ipAddress: string | null
    prefixLength: number | null
    mtu: number | null
    speed: string
    adminSt: string
    operSt: string
    present: boolean
    firstSeenAt: string
    lastSeenAt: string
    device: { id: string; hostname: string; site: string; managementIp: string }
  }
  range: LegacyRange
  chart: LegacyInterfaceSampleView[]
  samples: LegacyInterfaceSampleView[]
  page: number
  total: number
  pageSize: number
}

export type LegacyInterfaceLoadState<T> = { kind: 'ready'; data: T } | { kind: 'unauthorized' }

export type LegacyInterfaceFiltersPayload = {
  state: LegacyInterfaceListState
  devices: LegacyInterfaceDeviceOption[]
}

export type LegacyInterfaceResultsPayload = {
  state: LegacyInterfaceListState
  results: LegacyInterfaceResults
}

export type LegacyInterfaceReadErrorCode = 'unauthorized' | 'read-failed'

export class LegacyInterfaceReadError extends Error {
  constructor(
    readonly code: LegacyInterfaceReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load legacy interfaces', options)
    this.name = 'LegacyInterfaceReadError'
  }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new LegacyInterfaceReadError()
  }
}

async function readInterfaceData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof LegacyInterfaceReadError) throw error
    throw new LegacyInterfaceReadError('read-failed', { cause: error })
  }
}

const cacheOptions = {
  tags: [LEGACY_INTERFACE_TAG],
  revalidate: LEGACY_INTERFACE_CACHE_SECONDS,
}

const SNAPSHOT_SELECT = {
  id: true,
  deviceId: true,
  ifName: true,
  description: true,
  ipAddress: true,
  prefixLength: true,
  mtu: true,
  speed: true,
  adminSt: true,
  operSt: true,
  present: true,
  firstSeenAt: true,
  lastSeenAt: true,
  device: { select: { id: true, hostname: true, site: true, managementIp: true } },
  samples: { orderBy: { collectedAt: 'desc' }, take: 1 },
} satisfies Prisma.LegacyInterfaceSnapshotSelect

const DETAIL_SELECT = {
  id: true,
  ifName: true,
  description: true,
  ipAddress: true,
  prefixLength: true,
  mtu: true,
  speed: true,
  adminSt: true,
  operSt: true,
  present: true,
  firstSeenAt: true,
  lastSeenAt: true,
  device: { select: { id: true, hostname: true, site: true, managementIp: true } },
} satisfies Prisma.LegacyInterfaceSnapshotSelect

/** The counters that drive both the CRC view and its column live in the newest
 *  sample per interface, so the row set is assembled in one read and the sort
 *  runs over the assembled rows rather than in SQL. */
function windowStartFor(window: LegacyInterfaceListState['window']): Date {
  const days = window === '30d' ? 30 : 7
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

async function readInterfaceRows(params: LegacyInterfaceListState): Promise<LegacyInterfaceRow[]> {
  const windowStart = windowStartFor(params.window)
  let crcTotals = new Map<string, bigint>()
  let interfaceIds: string[] | undefined

  if (params.view === 'crc') {
    const crcSamples = await prisma.legacyInterfaceSample.findMany({
      where: { collectedAt: { gte: windowStart }, dCrcErrors: { gt: BigInt(0) } },
      select: { interfaceId: true, dCrcErrors: true },
    })
    crcTotals = sumLegacyCrcByInterface(crcSamples)
    interfaceIds = [...crcTotals.keys()]
  } else if (params.view === 'state-changed') {
    interfaceIds = await queryLegacyStateChangedInterfaceIds(
      (sql) => prisma.$queryRaw<Array<{ interfaceId: string }>>(sql),
      windowStart,
    )
  }

  const snapshots = await prisma.legacyInterfaceSnapshot.findMany({
    where: buildLegacyInterfaceWhere({
      query: params.query,
      deviceIds: params.deviceIds,
      interfaceIds,
      presence: 'present',
    }),
    select: SNAPSHOT_SELECT,
  })

  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    deviceId: snapshot.deviceId,
    hostname: snapshot.device.hostname,
    site: snapshot.device.site,
    managementIp: snapshot.device.managementIp,
    ifName: snapshot.ifName,
    description: snapshot.description,
    ipAddress: snapshot.ipAddress,
    prefixLength: snapshot.prefixLength,
    mtu: snapshot.mtu,
    speed: snapshot.speed,
    adminSt: snapshot.adminSt,
    operSt: snapshot.operSt,
    present: snapshot.present,
    firstSeenAt: snapshot.firstSeenAt.toISOString(),
    lastSeenAt: snapshot.lastSeenAt.toISOString(),
    crcWindowTotal: crcTotals.get(snapshot.id)?.toString() ?? null,
    sample: snapshot.samples[0] ? serializeLegacyInterfaceSample(snapshot.samples[0]) : null,
  }))
}

export async function getLegacyInterfaceSummary(): Promise<LegacyInterfaceSummary> {
  await authorize()
  return readInterfaceData(() =>
    unstable_cache(
      async () => {
        const [total, down, absent, withHistory] = await Promise.all([
          prisma.legacyInterfaceSnapshot.count(),
          prisma.legacyInterfaceSnapshot.count({
            where: { present: true, operSt: { equals: 'down', mode: 'insensitive' } },
          }),
          prisma.legacyInterfaceSnapshot.count({ where: { present: false } }),
          prisma.legacyInterfaceSnapshot.count({ where: { samples: { some: {} } } }),
        ])
        return { total, down, absent, withHistory }
      },
      ['legacy-interfaces', 'summary'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyInterfaceFilterOptions(): Promise<LegacyInterfaceFilterOptions> {
  await authorize()
  return readInterfaceData(() =>
    unstable_cache(
      async () => ({
        devices: await prisma.legacyDevice.findMany({
          select: { id: true, hostname: true, site: true },
          orderBy: { hostname: 'asc' },
        }),
      }),
      ['legacy-interfaces', 'filter-options'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyInterfaceResults(
  params: LegacyInterfaceListState,
): Promise<LegacyInterfaceResults> {
  await authorize()
  return readInterfaceData(async () => {
    // Only the filters reach the database; sort, page, and counter mode reshape
    // the same row set, so they stay out of the cache key.
    const rows = await unstable_cache(
      () => readInterfaceRows(params),
      [
        'legacy-interfaces',
        'rows',
        params.query,
        [...params.deviceIds].sort().join(','),
        params.view,
        // The window only narrows the row set in the derived views.
        params.view === 'all' ? '' : params.window,
      ],
      cacheOptions,
    )()

    const sorted = sortLegacyInterfaceRows(rows, {
      key: params.sortKey,
      direction: params.sortDirection,
      mode: params.mode,
      view: params.view,
    })
    const start = (params.page - 1) * params.pageSize
    return {
      rows: sorted.slice(start, start + params.pageSize),
      total: sorted.length,
      page: params.page,
      pageSize: params.pageSize,
    }
  })
}

/** Drawer history is an on-demand detail read for one interface, so it stays
 *  uncached; only the authorization boundary is shared with the page reads. */
export async function getLegacyInterfaceHistory(
  interfaceId: string,
  options: { range: LegacyRange; page?: number },
): Promise<LegacyInterfaceHistory | null> {
  await authorize()
  if (!interfaceId) return null

  return readInterfaceData(async () => {
    const range = parseLegacyRange(options.range)
    const cutoff = legacyRangeCutoff(range)
    const page = Math.max(1, Math.trunc(options.page ?? 1))
    const where = { interfaceId, ...(cutoff ? { collectedAt: { gte: cutoff } } : {}) }

    const [snapshot, chartDesc, samples, total] = await Promise.all([
      prisma.legacyInterfaceSnapshot.findUnique({
        where: { id: interfaceId },
        select: DETAIL_SELECT,
      }),
      prisma.legacyInterfaceSample.findMany({
        where,
        orderBy: { collectedAt: 'desc' },
        take: CHART_POINT_LIMIT,
      }),
      prisma.legacyInterfaceSample.findMany({
        where,
        orderBy: { collectedAt: 'desc' },
        skip: (page - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
      }),
      prisma.legacyInterfaceSample.count({ where }),
    ])
    if (!snapshot) return null

    return {
      snapshot: {
        id: snapshot.id,
        ifName: snapshot.ifName,
        description: snapshot.description,
        ipAddress: snapshot.ipAddress,
        prefixLength: snapshot.prefixLength,
        mtu: snapshot.mtu,
        speed: snapshot.speed,
        adminSt: snapshot.adminSt,
        operSt: snapshot.operSt,
        present: snapshot.present,
        firstSeenAt: snapshot.firstSeenAt.toISOString(),
        lastSeenAt: snapshot.lastSeenAt.toISOString(),
        device: snapshot.device,
      },
      range,
      chart: chartDesc.reverse().map(serializeLegacyInterfaceSample),
      samples: samples.map(serializeLegacyInterfaceSample),
      page,
      total,
      pageSize: HISTORY_PAGE_SIZE,
    }
  })
}
