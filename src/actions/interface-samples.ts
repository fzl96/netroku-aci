'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  rangeToCutoff,
  serializeErrorSamples,
  type ErrorTrendPoint,
  type ErrorTrendRange,
} from '@/app/(app)/interface-health/error-trend'
import {
  serializeStatusSamples,
  type InterfaceStatusDetails,
  type StatusHistorySample,
} from '@/app/(app)/interface-health/state-changes'

// Lazily fetch one interface's error/discard deltas over a time range,
// ordered oldest -> newest for charting. Uses @@index([interfaceId, sampledAt]).
export async function getInterfaceErrorSamples(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<ErrorTrendPoint[]> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const cutoff = rangeToCutoff(range, new Date())

  const rows = await prisma.interfaceSample.findMany({
    where: {
      interfaceId,
      ...(cutoff ? { sampledAt: { gte: cutoff } } : {}),
    },
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
): Promise<InterfaceStatusDetails> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const cutoff = rangeToCutoff(range, new Date())

  const snapshot = await prisma.interfaceSnapshot.findUnique({
    where: { id: interfaceId },
  })

  if (!snapshot) throw new Error('Interface not found')

  const samples = await prisma.interfaceSample.findMany({
    where: {
      interfaceId,
      ...(cutoff ? { sampledAt: { gte: cutoff } } : {}),
    },
    orderBy: { sampledAt: 'asc' },
    select: {
      id: true,
      sampledAt: true,
      adminSt: true,
      operSt: true,
      operSpeed: true,
    },
  })

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
    samples: serializeStatusSamples(samples),
  }
}
