'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { serializeLegacyInterfaceSample } from '@/lib/legacy-ui/interfaces'
import { legacyRangeCutoff, parseLegacyRange, type LegacyRange } from '@/lib/legacy-ui/query'

const HISTORY_PAGE_SIZE = 25
const CHART_POINT_LIMIT = 300

export async function getLegacyInterfaceHistory(
  interfaceId: string,
  options: { range: LegacyRange; page?: number },
) {
  if (!await getSession()) throw new Error('Unauthorized')
  if (!interfaceId) throw new Error('Interface is required')

  const range = parseLegacyRange(options.range)
  const cutoff = legacyRangeCutoff(range)
  const page = Math.max(1, Math.trunc(options.page ?? 1))
  const where = { interfaceId, ...(cutoff ? { collectedAt: { gte: cutoff } } : {}) }

  const [snapshot, chartDesc, samples, total] = await Promise.all([
    prisma.legacyInterfaceSnapshot.findUnique({
      where: { id: interfaceId },
      include: { device: { select: { id: true, hostname: true, site: true, managementIp: true } } },
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

  if (!snapshot) throw new Error('Interface not found')

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
}

export type LegacyInterfaceHistory = Awaited<ReturnType<typeof getLegacyInterfaceHistory>>
