'use server'

import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  rangeToCutoff,
  serializeErrorSamples,
  type ErrorTrendPoint,
  type ErrorTrendRange,
} from '@/app/(app)/interface-health/error-trend'

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
