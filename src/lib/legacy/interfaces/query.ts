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
import {
  buildLegacyInterfaceWhere,
  serializeLegacyInterfaceCounters,
  serializeLegacyInterfaceSample,
} from './filters'
import { sortLegacyInterfaceRows } from './list-data'
import type { LegacyInterfaceListState } from './params'
import { queryLegacyStateChangedInterfaceIds } from './state-change-query'

const LEGACY_INTERFACE_CACHE_SECONDS = 28_800
const LEGACY_INTERFACE_TAG = 'legacy-interfaces:all'
const HISTORY_PAGE_SIZE = 25
const CHART_POINT_LIMIT = 300

export type LegacyInterfaceSampleView = ReturnType<typeof serializeLegacyInterfaceSample>
export type LegacyInterfaceCounterView = ReturnType<typeof serializeLegacyInterfaceCounters>

/** Exactly what the list table renders and sorts on. Everything else about an
 *  interface — MTU, presence, first/last seen, the device's management IP, the
 *  non-counter sample columns — belongs to the detail page, which reads it for
 *  one interface instead of for every row on the page. */
export type LegacyInterfaceRow = {
  id: string
  hostname: string
  site: string
  ifName: string
  description: string
  ipAddress: string | null
  prefixLength: number | null
  speed: string
  adminSt: string
  operSt: string
  crcWindowTotal: string | null
  sample: LegacyInterfaceCounterView | null
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
  chart: LegacyInterfaceCounterView[]
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

const COUNTER_SELECT = {
  collectedAt: true,
  inputErrors: true,
  outputErrors: true,
  crcErrors: true,
  dInputErrors: true,
  dOutputErrors: true,
  dCrcErrors: true,
} satisfies Prisma.LegacyInterfaceSampleSelect

const LIST_SELECT = {
  id: true,
  ifName: true,
  description: true,
  ipAddress: true,
  prefixLength: true,
  speed: true,
  adminSt: true,
  operSt: true,
  device: { select: { hostname: true, site: true } },
  samples: { orderBy: { collectedAt: 'desc' }, take: 1, select: COUNTER_SELECT },
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

/** Natural interface ordering and exact BigInt counters have no SQL equivalent,
 *  so the matched rows are assembled in one read and sorted and paged in
 *  memory. That read is kept to the table's own columns for the same reason. */
function windowStartFor(window: LegacyInterfaceListState['window']): Date {
  const days = window === '30d' ? 30 : 7
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/** Positive deltas only, summed in the database. A busy 30-day window holds far
 *  more qualifying samples than there are interfaces, so the totals come back
 *  already grouped rather than row by row. */
async function readCrcWindowTotals(windowStart: Date): Promise<Map<string, bigint>> {
  const grouped = await prisma.legacyInterfaceSample.groupBy({
    by: ['interfaceId'],
    where: { collectedAt: { gte: windowStart }, dCrcErrors: { gt: BigInt(0) } },
    _sum: { dCrcErrors: true },
  })
  const totals = new Map<string, bigint>()
  for (const row of grouped) {
    const total = row._sum.dCrcErrors
    if (total !== null && total > BigInt(0)) totals.set(row.interfaceId, total)
  }
  return totals
}

async function readInterfaceRows(params: LegacyInterfaceListState): Promise<LegacyInterfaceRow[]> {
  const windowStart = windowStartFor(params.window)
  let crcTotals = new Map<string, bigint>()
  let interfaceIds: string[] | undefined

  if (params.view === 'crc') {
    crcTotals = await readCrcWindowTotals(windowStart)
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
    select: LIST_SELECT,
  })

  return snapshots.map((snapshot) => ({
    id: snapshot.id,
    hostname: snapshot.device.hostname,
    site: snapshot.device.site,
    ifName: snapshot.ifName,
    description: snapshot.description,
    ipAddress: snapshot.ipAddress,
    prefixLength: snapshot.prefixLength,
    speed: snapshot.speed,
    adminSt: snapshot.adminSt,
    operSt: snapshot.operSt,
    crcWindowTotal: crcTotals.get(snapshot.id)?.toString() ?? null,
    sample: snapshot.samples[0] ? serializeLegacyInterfaceCounters(snapshot.samples[0]) : null,
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

/** The detail page's read: one interface, its facts, and the samples behind its
 *  chart and table. Uncached — it is a single-row read whose range the reader
 *  changes freely — and it shares only the authorization boundary with the
 *  list. */
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
        select: COUNTER_SELECT,
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
      chart: chartDesc.reverse().map(serializeLegacyInterfaceCounters),
      samples: samples.map(serializeLegacyInterfaceSample),
      page,
      total,
      pageSize: HISTORY_PAGE_SIZE,
    }
  })
}
