'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface FaultTileHost {
  apicHostId: string
  name: string
  critical: number
  major: number
  minor: number
  warning: number
  spark: number[]
  lastSyncedAt: string | null
}

/** Latest active-fault severity counts + a recent total-fault sparkline per host. */
export async function getFaultCountSummary(): Promise<FaultTileHost[]> {
  const session = await getSession()
  if (!session) return []

  const hosts = await prisma.apicHost.findMany({
    select: { id: true, name: true, lastFaultSyncAt: true },
  })

  const summary: FaultTileHost[] = []
  for (const host of hosts) {
    const grouped = await prisma.faultSnapshot.groupBy({
      by: ['severity'],
      where: { apicHostId: host.id, lifecycle: 'active' },
      _count: { _all: true },
    })
    const bySeverity = (s: string) =>
      grouped.find(g => g.severity === s)?._count._all ?? 0

    const samples = await prisma.faultCountSample.findMany({
      where: { apicHostId: host.id },
      orderBy: { sampledAt: 'desc' },
      take: 20,
      select: { total: true },
    })

    summary.push({
      apicHostId: host.id,
      name: host.name,
      critical: bySeverity('critical'),
      major: bySeverity('major'),
      minor: bySeverity('minor'),
      warning: bySeverity('warning'),
      spark: samples.map(s => s.total).reverse(),
      lastSyncedAt: host.lastFaultSyncAt ? host.lastFaultSyncAt.toISOString() : null,
    })
  }
  return summary
}
