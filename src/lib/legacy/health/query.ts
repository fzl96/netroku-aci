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
  buildLegacyHealthDeviceWhere,
  legacyHealthOrderBy,
  serializeLegacyHealthSample,
} from './filters'
import type { LegacyHealthPageParams } from './params'

const LEGACY_HEALTH_CACHE_SECONDS = 28_800
const LEGACY_HEALTH_TAG = 'legacy-health:all'
const HISTORY_PAGE_SIZE = 25
const CHART_POINT_LIMIT = 300

export type LegacyHealthSampleView = ReturnType<typeof serializeLegacyHealthSample>

export type LegacyHealthRow = {
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  sample: LegacyHealthSampleView
}

export type LegacyHealthSummary = {
  devices: number
  samples: number
  logs: number
  latest: string | null
}

export type LegacyHealthFilterOptions = { sites: string[] }

export type LegacyHealthResults = {
  rows: LegacyHealthRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
}

export type LegacyHealthLogEntry = {
  id: string
  eventAt: string | null
  collectedAt: string
  severity: string | null
  message: string
  raw: string
}

export type LegacyHealthHistory = {
  device: { id: string; hostname: string; site: string }
  range: LegacyRange
  chart: LegacyHealthSampleView[]
  samples: LegacyHealthSampleView[]
  samplePage: number
  sampleTotal: number
  logs: LegacyHealthLogEntry[]
  logPage: number
  logTotal: number
  pageSize: number
}

export type LegacyHealthReadErrorCode = 'unauthorized' | 'read-failed'

export class LegacyHealthReadError extends Error {
  constructor(
    readonly code: LegacyHealthReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load legacy health', options)
    this.name = 'LegacyHealthReadError'
  }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new LegacyHealthReadError()
  }
}

async function readHealthData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof LegacyHealthReadError) throw error
    throw new LegacyHealthReadError('read-failed', { cause: error })
  }
}

const cacheOptions = {
  tags: [LEGACY_HEALTH_TAG],
  revalidate: LEGACY_HEALTH_CACHE_SECONDS,
}

const DEVICE_SELECT = {
  id: true,
  hostname: true,
  site: true,
  managementIp: true,
  healthSamples: { orderBy: { collectedAt: 'desc' }, take: 1 },
} satisfies Prisma.LegacyDeviceSelect

export async function getLegacyHealthSummary(): Promise<LegacyHealthSummary> {
  await authorize()
  return readHealthData(() =>
    unstable_cache(
      async () => {
        const [devices, samples, logs, latest] = await Promise.all([
          prisma.legacyDevice.count({ where: { healthSamples: { some: {} } } }),
          prisma.legacyHealthSample.count(),
          prisma.legacyLogEntry.count(),
          prisma.legacyHealthSample.findFirst({
            orderBy: { collectedAt: 'desc' },
            select: { collectedAt: true },
          }),
        ])
        return { devices, samples, logs, latest: latest?.collectedAt.toISOString() ?? null }
      },
      ['legacy-health', 'summary'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyHealthFilterOptions(): Promise<LegacyHealthFilterOptions> {
  await authorize()
  return readHealthData(() =>
    unstable_cache(
      async () => {
        const rows = await prisma.legacyDevice.findMany({
          where: { healthSamples: { some: {} } },
          distinct: ['site'],
          select: { site: true },
          orderBy: { site: 'asc' },
        })
        return { sites: rows.map((row) => row.site) }
      },
      ['legacy-health', 'filter-options'],
      cacheOptions,
    )(),
  )
}

export async function getLegacyHealthResults(
  params: LegacyHealthPageParams,
): Promise<LegacyHealthResults> {
  await authorize()
  return readHealthData(() =>
    unstable_cache(
      async (): Promise<LegacyHealthResults> => {
        const where = buildLegacyHealthDeviceWhere({
          query: params.query,
          sites: params.site ? [params.site] : [],
        })
        const [devices, total] = await Promise.all([
          prisma.legacyDevice.findMany({
            where,
            orderBy: legacyHealthOrderBy(params.sort, params.direction),
            skip: (params.page - 1) * params.pageSize,
            take: params.pageSize,
            select: DEVICE_SELECT,
          }),
          prisma.legacyDevice.count({ where }),
        ])
        return {
          // Devices without a sample have nothing to show in a health row.
          rows: devices.flatMap((device) =>
            device.healthSamples[0]
              ? [
                  {
                    deviceId: device.id,
                    hostname: device.hostname,
                    site: device.site,
                    managementIp: device.managementIp,
                    sample: serializeLegacyHealthSample(device.healthSamples[0]),
                  },
                ]
              : [],
          ),
          total,
          page: params.page,
          pageSize: params.pageSize,
        }
      },
      [
        'legacy-health',
        'results',
        params.query,
        params.site,
        params.sort,
        params.direction,
        String(params.page),
        String(params.pageSize),
      ],
      cacheOptions,
    )(),
  )
}

/** Drawer history is an on-demand detail read for one device, so it stays
 *  uncached; only the authorization boundary is shared with the page reads. */
export async function getLegacyHealthHistory(
  deviceId: string,
  options: { range: LegacyRange; samplePage?: number; logPage?: number },
): Promise<LegacyHealthHistory | null> {
  await authorize()
  if (!deviceId) return null

  return readHealthData(async () => {
    const range = parseLegacyRange(options.range)
    const cutoff = legacyRangeCutoff(range)
    const samplePage = Math.max(1, Math.trunc(options.samplePage ?? 1))
    const logPage = Math.max(1, Math.trunc(options.logPage ?? 1))
    const collectedWhere = { deviceId, ...(cutoff ? { collectedAt: { gte: cutoff } } : {}) }

    const [device, chartDesc, samples, sampleTotal, logs, logTotal] = await Promise.all([
      prisma.legacyDevice.findUnique({
        where: { id: deviceId },
        select: { id: true, hostname: true, site: true },
      }),
      prisma.legacyHealthSample.findMany({
        where: collectedWhere,
        orderBy: { collectedAt: 'desc' },
        take: CHART_POINT_LIMIT,
      }),
      prisma.legacyHealthSample.findMany({
        where: collectedWhere,
        orderBy: { collectedAt: 'desc' },
        skip: (samplePage - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
      }),
      prisma.legacyHealthSample.count({ where: collectedWhere }),
      prisma.legacyLogEntry.findMany({
        where: collectedWhere,
        orderBy: { collectedAt: 'desc' },
        skip: (logPage - 1) * HISTORY_PAGE_SIZE,
        take: HISTORY_PAGE_SIZE,
      }),
      prisma.legacyLogEntry.count({ where: collectedWhere }),
    ])
    if (!device) return null

    return {
      device,
      range,
      chart: chartDesc.reverse().map(serializeLegacyHealthSample),
      samples: samples.map(serializeLegacyHealthSample),
      samplePage,
      sampleTotal,
      logs: logs.map((log) => ({
        id: log.id,
        eventAt: log.eventAt?.toISOString() ?? null,
        collectedAt: log.collectedAt.toISOString(),
        severity: log.severity,
        message: log.message,
        raw: log.raw,
      })),
      logPage,
      logTotal,
      pageSize: HISTORY_PAGE_SIZE,
    }
  })
}
