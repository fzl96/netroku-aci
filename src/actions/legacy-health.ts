'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { legacyRangeCutoff, parseLegacyRange, type LegacyRange } from '@/lib/legacy-ui/query'
import { serializeLegacyHealthSample } from '@/lib/legacy-ui/health'

const HISTORY_PAGE_SIZE = 25
const CHART_POINT_LIMIT = 300

export interface LegacyHealthHistoryOptions {
  range: LegacyRange
  samplePage?: number
  logPage?: number
}

export async function getLegacyHealthHistory(
  deviceId: string,
  options: LegacyHealthHistoryOptions,
) {
  if (!await getSession()) throw new Error('Unauthorized')
  if (!deviceId) throw new Error('Device is required')
  const range = parseLegacyRange(options.range)
  const cutoff = legacyRangeCutoff(range)
  const samplePage = Math.max(1, Math.trunc(options.samplePage ?? 1))
  const logPage = Math.max(1, Math.trunc(options.logPage ?? 1))
  const collectedWhere = { deviceId, ...(cutoff ? { collectedAt: { gte: cutoff } } : {}) }

  const [device, chartDesc, samples, sampleTotal, logs, logTotal] = await Promise.all([
    prisma.legacyDevice.findUnique({ where: { id: deviceId }, select: { id: true, hostname: true, site: true } }),
    prisma.legacyHealthSample.findMany({ where: collectedWhere, orderBy: { collectedAt: 'desc' }, take: CHART_POINT_LIMIT }),
    prisma.legacyHealthSample.findMany({ where: collectedWhere, orderBy: { collectedAt: 'desc' }, skip: (samplePage - 1) * HISTORY_PAGE_SIZE, take: HISTORY_PAGE_SIZE }),
    prisma.legacyHealthSample.count({ where: collectedWhere }),
    prisma.legacyLogEntry.findMany({ where: collectedWhere, orderBy: { collectedAt: 'desc' }, skip: (logPage - 1) * HISTORY_PAGE_SIZE, take: HISTORY_PAGE_SIZE }),
    prisma.legacyLogEntry.count({ where: collectedWhere }),
  ])
  if (!device) throw new Error('Device not found')

  return {
    device,
    range,
    chart: chartDesc.reverse().map(serializeLegacyHealthSample),
    samples: samples.map(serializeLegacyHealthSample),
    samplePage,
    sampleTotal,
    logs: logs.map(log => ({
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
}

export type LegacyHealthHistory = Awaited<ReturnType<typeof getLegacyHealthHistory>>
