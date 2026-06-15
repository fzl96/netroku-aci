'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface NodeTileSummary {
  nodesOnline: number
  nodesTotal: number
  componentsFailed: number
}

/** Aggregate node online/total and failed-component counts across all hosts. */
export async function getNodeSummary(): Promise<NodeTileSummary> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { nodesOnline: 0, nodesTotal: 0, componentsFailed: 0 }

  const [nodesTotal, nodesOnline, componentsFailed] = await Promise.all([
    prisma.nodeSnapshot.count({ where: { present: true } }),
    prisma.nodeSnapshot.count({ where: { present: true, fabricSt: 'active' } }),
    prisma.hardwareComponent.count({ where: { present: true, healthy: false } }),
  ])
  return { nodesOnline, nodesTotal, componentsFailed }
}
