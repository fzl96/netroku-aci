'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { isNodeOnline } from '@/lib/apic/node-status'
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

  const [nodes, componentsFailed] = await Promise.all([
    prisma.nodeSnapshot.findMany({
      where: { present: true },
      select: { role: true, fabricSt: true, state: true },
    }),
    prisma.hardwareComponent.count({ where: { present: true, healthy: false } }),
  ])

  const nodesTotal = nodes.length
  const nodesOnline = nodes.filter(isNodeOnline).length
  return { nodesOnline, nodesTotal, componentsFailed }
}
