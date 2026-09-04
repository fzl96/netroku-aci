import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { aggregateCrcTrend, type CrcTrendPoint } from './crc-trend'
import {
  rangeToCutoff,
  serializeErrorSamples,
  type ErrorTrendPoint,
  type ErrorTrendRange,
} from './error-trend'
import { sortByCrcWindowTotal, sumCrcByInterface } from './crc-window'
import type { InterfaceExportSample } from './export'
import { buildInterfaceSnapshotWhere } from './interface-query'
import {
  interfaceWindowStart,
  type InterfaceHealthPageParams,
  type InterfacePageSize,
  type InterfaceWindow,
} from './params'
import { sortInterfaceRows, type InterfaceSortDirection, type TableSortKey } from './sort'
import { queryStateChangedInterfaceIds } from './state-change-query'
import {
  isRecentLinkStateChange,
  serializeStatusSamples,
  type InterfaceStatusDetails,
} from './state-changes'

const INTERFACE_CACHE_SECONDS = 28_800

const SAMPLE_SELECT = {
  sampledAt: true,
  rxBytes: true,
  rxErrors: true,
  rxCrcErrors: true,
  rxAlignErrors: true,
  txBytes: true,
  txErrors: true,
  dRxBytes: true,
  dRxErrors: true,
  dRxDiscards: true,
  dRxCrcErrors: true,
  dRxAlignErrors: true,
  dTxBytes: true,
  dTxErrors: true,
  dTxDiscards: true,
} satisfies Prisma.InterfaceSampleSelect

export type InterfaceHostOption = { id: string; name: string; host: string }
export type InterfaceHostResolution =
  | { kind: 'selected'; host: InterfaceHostOption; hosts: InterfaceHostOption[] }
  | { kind: 'redirect'; location: string; hosts: InterfaceHostOption[] }
  | { kind: 'empty'; hosts: [] }

export type InterfaceOverviewData = {
  lastSyncedAt: string | null
  availableNodes: string[]
}

export type InterfaceCrcWindowTotal = { interfaceId: string; total: string }
export type InterfaceCrcWindowData = {
  trend: CrcTrendPoint[]
  totals: InterfaceCrcWindowTotal[]
}

export type InterfaceRow = {
  id: string
  node: string
  ifName: string
  dn: string
  usage: string
  adminSt: string
  operSt: string
  operSpeed: string
  description: string
  lastLinkStChg: string | null
  lastSampledAt: string | null
  rxBytes: string | null
  rxErrors: string | null
  rxCrcErrors: string | null
  rxAlignErrors: string | null
  txBytes: string | null
  txErrors: string | null
  dRxBytes: string | null
  dRxErrors: string | null
  dRxDiscards: string | null
  dRxCrcErrors: string | null
  dRxAlignErrors: string | null
  dTxBytes: string | null
  dTxErrors: string | null
  dTxDiscards: string | null
  crcWindowTotal: string | null
  hasRecentStateChange: boolean
}

export type InterfaceResultsData = {
  rows: InterfaceRow[]
  total: number
  page: number
  pageSize: InterfacePageSize
  sortKey: TableSortKey | null
  sortDirection: InterfaceSortDirection
}

export type InterfaceLoadState<T> =
  { kind: 'ready'; data: T } | { kind: 'inactive' } | { kind: 'unauthorized' }

export type InterfaceOverviewPayload = {
  params: InterfaceHealthPageParams
  overview: InterfaceOverviewData
}

export type InterfaceCrcTrendPayload = {
  trend: CrcTrendPoint[]
}

export type InterfaceResultsPayload = {
  params: InterfaceHealthPageParams
  results: InterfaceResultsData
}

export class InterfaceReadError extends Error {
  readonly code = 'unauthorized'
  constructor() {
    super('Unauthorized')
    this.name = 'InterfaceReadError'
  }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new InterfaceReadError()
  }
}

function cacheOptions(hostId: string) {
  return {
    tags: ['interfaces:all', `interfaces:host:${hostId}`],
    revalidate: INTERFACE_CACHE_SECONDS,
  }
}

async function resolveForRequest(requestedHostId: string): Promise<InterfaceHostResolution> {
  await authorize()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, host: true },
  })
  if (!hosts.length) return { kind: 'empty', hosts: [] }
  const host = hosts.find((candidate) => candidate.id === requestedHostId)
  if (host) return { kind: 'selected', host, hosts }
  return {
    kind: 'redirect',
    location: `/interface-health?apic=${encodeURIComponent(hosts[0].id)}`,
    hosts,
  }
}
export const resolveInterfaceHost = cache(resolveForRequest)

export async function getInterfaceOverview(hostId: string): Promise<InterfaceOverviewData> {
  await authorize()
  return unstable_cache(
    async () => {
      const [host, nodes] = await Promise.all([
        prisma.apicHost.findFirst({
          where: { id: hostId },
          select: { lastInterfaceSyncAt: true },
        }),
        prisma.interfaceSnapshot.findMany({
          where: { apicHostId: hostId },
          select: { node: true },
          distinct: ['node'],
        }),
      ])
      return {
        lastSyncedAt: host?.lastInterfaceSyncAt?.toISOString() ?? null,
        availableNodes: nodes
          .map((row) => row.node)
          .filter((node) => node !== '')
          .sort(),
      }
    },
    ['interface-health', 'overview', hostId],
    cacheOptions(hostId),
  )()
}

function readCachedInterfaceCrcWindow(
  hostId: string,
  window: InterfaceWindow,
): Promise<InterfaceCrcWindowData> {
  return unstable_cache(
    async () => {
      const samples = await prisma.interfaceSample.findMany({
        where: {
          apicHostId: hostId,
          sampledAt: { gte: interfaceWindowStart(window, new Date()) },
          dRxCrcErrors: { gt: BigInt(0) },
        },
        select: { interfaceId: true, sampledAt: true, dRxCrcErrors: true },
        orderBy: { sampledAt: 'asc' },
      })
      return {
        trend: aggregateCrcTrend(samples),
        totals: [...sumCrcByInterface(samples)].map(([interfaceId, total]) => ({
          interfaceId,
          total: total.toString(),
        })),
      }
    },
    ['interface-health', 'crc-window', hostId, window],
    cacheOptions(hostId),
  )()
}

/** One window fetch feeds both the aggregate trend chart and the per-port
 *  windowed totals, so the CRC view never queries the sample table twice. */
export async function getInterfaceCrcWindow(
  hostId: string,
  window: InterfaceWindow,
): Promise<InterfaceCrcWindowData> {
  await authorize()
  return readCachedInterfaceCrcWindow(hostId, window)
}

function sortToken(params: InterfaceHealthPageParams): string {
  const { sort } = params
  if (sort.kind === 'counter') {
    return `counter:${sort.sort.key}:${sort.sort.direction}:${sort.sort.mode}`
  }
  if (sort.kind === 'crc-window') {
    return `crc-window::${sort.direction}:${params.counterMode}`
  }
  return `natural::desc:${params.counterMode}`
}

function displaySort(params: InterfaceHealthPageParams): {
  sortKey: TableSortKey | null
  sortDirection: InterfaceSortDirection
} {
  const { sort } = params
  if (sort.kind === 'counter') {
    return { sortKey: sort.sort.key, sortDirection: sort.sort.direction }
  }
  if (sort.kind === 'crc-window') {
    return { sortKey: 'crcWindowTotal', sortDirection: sort.direction }
  }
  return { sortKey: null, sortDirection: 'desc' }
}

type StoredSnapshot = {
  id: string
  node: string
  ifName: string
  dn: string
  usage: string
  adminSt: string
  operSt: string
  operSpeed: string
  description: string
  lastLinkStChg: Date | null
  samples: Array<Prisma.InterfaceSampleGetPayload<{ select: typeof SAMPLE_SELECT }>>
}

function serializeRow(
  row: StoredSnapshot,
  crcTotals: Map<string, bigint> | null,
  windowStart: Date,
): InterfaceRow {
  const latest = row.samples[0]
  return {
    id: row.id,
    node: row.node,
    ifName: row.ifName,
    dn: row.dn,
    usage: row.usage,
    adminSt: row.adminSt,
    operSt: row.operSt,
    operSpeed: row.operSpeed,
    description: row.description,
    lastLinkStChg: row.lastLinkStChg?.toISOString() ?? null,
    lastSampledAt: latest?.sampledAt.toISOString() ?? null,
    rxBytes: latest?.rxBytes.toString() ?? null,
    rxErrors: latest?.rxErrors.toString() ?? null,
    rxCrcErrors: latest?.rxCrcErrors.toString() ?? null,
    rxAlignErrors: latest?.rxAlignErrors.toString() ?? null,
    txBytes: latest?.txBytes.toString() ?? null,
    txErrors: latest?.txErrors.toString() ?? null,
    dRxBytes: latest?.dRxBytes?.toString() ?? null,
    dRxErrors: latest?.dRxErrors?.toString() ?? null,
    dRxDiscards: latest?.dRxDiscards?.toString() ?? null,
    dRxCrcErrors: latest?.dRxCrcErrors?.toString() ?? null,
    dRxAlignErrors: latest?.dRxAlignErrors?.toString() ?? null,
    dTxBytes: latest?.dTxBytes?.toString() ?? null,
    dTxErrors: latest?.dTxErrors?.toString() ?? null,
    dTxDiscards: latest?.dTxDiscards?.toString() ?? null,
    crcWindowTotal: crcTotals ? (crcTotals.get(row.id) ?? BigInt(0)).toString() : null,
    hasRecentStateChange: isRecentLinkStateChange(row.lastLinkStChg, windowStart),
  }
}

export async function getInterfaceResults(
  params: InterfaceHealthPageParams,
  preloadedCrcWindow?: InterfaceCrcWindowData | null,
): Promise<InterfaceResultsData> {
  await authorize()

  // Authentication remains outside every persistent cache producer. The view
  // can pass its already-started CRC read so the trend and table share it.
  const crcWindow =
    params.view === 'crc'
      ? (preloadedCrcWindow ?? (await readCachedInterfaceCrcWindow(params.hostId, params.window)))
      : null

  const rows = await unstable_cache(
    async (crcWindowTotals: InterfaceCrcWindowTotal[] | null): Promise<InterfaceRow[]> => {
      const windowStart = interfaceWindowStart(params.window, new Date())

      const crcTotals = crcWindowTotals
        ? new Map(
            crcWindowTotals.map(({ interfaceId, total }) => [interfaceId, BigInt(total)] as const),
          )
        : null

      const stateChangedInterfaceIds =
        params.view === 'state-changed'
          ? await queryStateChangedInterfaceIds(
              (sql) => prisma.$queryRaw<Array<{ interfaceId: string }>>(sql),
              params.hostId,
              windowStart,
            )
          : []

      const where = buildInterfaceSnapshotWhere({
        apicHostId: params.hostId,
        view: params.view,
        windowStart,
        stateChangedInterfaceIds,
        crcInterfaceIds: crcTotals ? [...crcTotals.keys()] : [],
        nodeFilter: params.nodes,
        query: params.query,
      })

      const snapshots = (await prisma.interfaceSnapshot.findMany({
        where,
        orderBy: [{ node: 'asc' }, { ifName: 'asc' }],
        include: { samples: { orderBy: { sampledAt: 'desc' }, take: 1, select: SAMPLE_SELECT } },
      })) as unknown as StoredSnapshot[]

      const sorted =
        params.sort.kind === 'crc-window'
          ? sortByCrcWindowTotal(snapshots, crcTotals ?? new Map(), params.sort.direction)
          : sortInterfaceRows(
              snapshots,
              params.sort.kind === 'counter' ? params.sort.sort : undefined,
            )

      return sorted.map((row) => serializeRow(row, crcTotals, windowStart))
    },
    [
      'interface-health',
      'results',
      params.hostId,
      params.view,
      params.window,
      params.query,
      JSON.stringify(params.nodes),
      sortToken(params),
    ],
    cacheOptions(params.hostId),
  )(crcWindow?.totals ?? null)

  const start = params.pageSize === 'all' ? 0 : (params.page - 1) * params.pageSize
  return {
    rows: params.pageSize === 'all' ? rows : rows.slice(start, start + params.pageSize),
    total: rows.length,
    page: params.page,
    pageSize: params.pageSize,
    ...displaySort(params),
  }
}

const STATUS_SAMPLE_SELECT = {
  id: true,
  sampledAt: true,
  adminSt: true,
  operSt: true,
  operSpeed: true,
} satisfies Prisma.InterfaceSampleSelect

/** Drawer reads are on-demand detail lookups for one port, so they stay
 *  uncached; only the authorization boundary is shared with the page reads. */
export async function getInterfaceErrorSamples(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<ErrorTrendPoint[]> {
  await authorize()
  const cutoff = rangeToCutoff(range, new Date())
  const rows = await prisma.interfaceSample.findMany({
    where: { interfaceId, ...(cutoff ? { sampledAt: { gte: cutoff } } : {}) },
    orderBy: { sampledAt: 'asc' },
    select: {
      sampledAt: true,
      dRxErrors: true,
      dTxErrors: true,
      dRxCrcErrors: true,
      dRxAlignErrors: true,
      dRxDiscards: true,
      dTxDiscards: true,
    },
  })
  return serializeErrorSamples(rows)
}

export async function getInterfaceStatusDetails(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<InterfaceStatusDetails | null> {
  await authorize()
  const cutoff = rangeToCutoff(range, new Date())
  const [snapshot, samples, baseline] = await Promise.all([
    prisma.interfaceSnapshot.findUnique({ where: { id: interfaceId } }),
    prisma.interfaceSample.findMany({
      where: { interfaceId, ...(cutoff ? { sampledAt: { gte: cutoff } } : {}) },
      orderBy: { sampledAt: 'asc' },
      select: STATUS_SAMPLE_SELECT,
    }),
    cutoff
      ? prisma.interfaceSample.findFirst({
          where: { interfaceId, sampledAt: { lt: cutoff } },
          orderBy: { sampledAt: 'desc' },
          select: STATUS_SAMPLE_SELECT,
        })
      : Promise.resolve(null),
  ])

  if (!snapshot) return null

  return {
    id: snapshot.id,
    node: snapshot.node,
    ifName: snapshot.ifName,
    dn: snapshot.dn,
    usage: snapshot.usage,
    adminSt: snapshot.adminSt,
    operSt: snapshot.operSt,
    operSpeed: snapshot.operSpeed,
    description: snapshot.description,
    lastLinkStChg: snapshot.lastLinkStChg?.toISOString() ?? null,
    firstSeenAt: snapshot.firstSeenAt.toISOString(),
    lastSeenAt: snapshot.lastSeenAt.toISOString(),
    samples: serializeStatusSamples(samples, baseline),
  }
}

export type InterfaceExportRequest = {
  hostId: string
  from: Date | null
  to: Date | null
  nodes: string[]
}
export type InterfaceExportData = { hostName: string; samples: InterfaceExportSample[] }

const INTERFACE_EXPORT_SELECT = {
  sampledAt: true,
  adminSt: true,
  operSt: true,
  operSpeed: true,
  rxBytes: true,
  rxPkts: true,
  rxErrors: true,
  rxDiscards: true,
  rxCrcErrors: true,
  rxAlignErrors: true,
  txBytes: true,
  txPkts: true,
  txErrors: true,
  txDiscards: true,
  dRxBytes: true,
  dRxErrors: true,
  dRxDiscards: true,
  dRxCrcErrors: true,
  dRxAlignErrors: true,
  dTxBytes: true,
  dTxErrors: true,
  dTxDiscards: true,
  interface: {
    select: { node: true, ifName: true, usage: true, description: true, dn: true },
  },
} satisfies Prisma.InterfaceSampleSelect

type StoredInterfaceExportSample = Prisma.InterfaceSampleGetPayload<{
  select: typeof INTERFACE_EXPORT_SELECT
}>

function serializeInterfaceExportSample(
  sample: StoredInterfaceExportSample,
): InterfaceExportSample {
  return {
    sampledAt: sample.sampledAt,
    adminSt: sample.adminSt,
    operSt: sample.operSt,
    operSpeed: sample.operSpeed,
    rxBytes: sample.rxBytes,
    rxPkts: sample.rxPkts,
    rxErrors: sample.rxErrors,
    rxDiscards: sample.rxDiscards,
    rxCrcErrors: sample.rxCrcErrors,
    rxAlignErrors: sample.rxAlignErrors,
    txBytes: sample.txBytes,
    txPkts: sample.txPkts,
    txErrors: sample.txErrors,
    txDiscards: sample.txDiscards,
    dRxBytes: sample.dRxBytes,
    dRxErrors: sample.dRxErrors,
    dRxDiscards: sample.dRxDiscards,
    dRxCrcErrors: sample.dRxCrcErrors,
    dRxAlignErrors: sample.dRxAlignErrors,
    dTxBytes: sample.dTxBytes,
    dTxErrors: sample.dTxErrors,
    dTxDiscards: sample.dTxDiscards,
    interface: {
      node: sample.interface.node,
      ifName: sample.interface.ifName,
      usage: sample.interface.usage,
      description: sample.interface.description,
      dn: sample.interface.dn,
    },
  }
}

/** Exports read raw counters rather than the page's serialized rows, so they
 *  bypass the page cache and stream straight from the sample table. */
export async function getInterfaceExport(
  request: InterfaceExportRequest,
): Promise<InterfaceExportData | null> {
  await authorize()
  const host = await prisma.apicHost.findFirst({
    where: { id: request.hostId },
    select: { id: true, name: true },
  })
  if (!host) return null

  const samples = await prisma.interfaceSample.findMany({
    where: {
      apicHostId: host.id,
      ...(request.from || request.to
        ? {
            sampledAt: {
              ...(request.from ? { gte: request.from } : {}),
              ...(request.to ? { lte: request.to } : {}),
            },
          }
        : {}),
      ...(request.nodes.length > 0 ? { interface: { node: { in: request.nodes } } } : {}),
    },
    orderBy: [{ sampledAt: 'asc' }, { interfaceId: 'asc' }],
    select: INTERFACE_EXPORT_SELECT,
  })

  return { hostName: host.name, samples: samples.map(serializeInterfaceExportSample) }
}
