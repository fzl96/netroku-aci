'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface HealthTileHost {
  apicHostId: string
  name: string
  overall: number | null
  worstScore: number | null
  lastSyncedAt: string | null
}

/** Latest overall fabric score + worst node/tenant score per host. */
export async function getHealthSummary(): Promise<HealthTileHost[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []

  const hosts = await prisma.apicHost.findMany({
    select: { id: true, name: true, lastHealthSyncAt: true },
  })

  const summary: HealthTileHost[] = []
  for (const host of hosts) {
    const fabric = await prisma.healthScoreSnapshot.findFirst({
      where: { apicHostId: host.id, present: true, scope: 'fabric' },
      select: { score: true },
    })
    const worst = await prisma.healthScoreSnapshot.findFirst({
      where: { apicHostId: host.id, present: true, scope: { in: ['node', 'tenant'] } },
      orderBy: { score: 'asc' },
      select: { score: true },
    })
    summary.push({
      apicHostId: host.id,
      name: host.name,
      overall: fabric?.score ?? null,
      worstScore: worst?.score ?? null,
      lastSyncedAt: host.lastHealthSyncAt ? host.lastHealthSyncAt.toISOString() : null,
    })
  }
  return summary
}
