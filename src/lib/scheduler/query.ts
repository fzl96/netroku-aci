import 'server-only'

import { cache } from 'react'
import { AuthenticationRequiredError, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toSafeSchedule, type SafeResyncSchedule } from '@/lib/apic/schedule-view'

export type SchedulerReadErrorCode = 'unauthorized' | 'read-failed'

export class SchedulerReadError extends Error {
  constructor(
    readonly code: SchedulerReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load resync schedules', options)
    this.name = 'SchedulerReadError'
  }
}

async function readSchedules(): Promise<SafeResyncSchedule[]> {
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'asc' },
    include: { schedule: true },
  })
  return hosts.map((host) =>
    toSafeSchedule({ id: host.id, name: host.name, host: host.host }, host.schedule),
  )
}

/** Deliberately uncached: `enabled`, `runningAt`, `lastRunAt`, and `nextRunAt`
 *  change every tick, so a persistent cache would show a stale run state to
 *  the mounted page's background poll. Wrapped in React `cache()` only to
 *  dedupe repeat reads within one request. */
export const getResyncSchedules = cache(async (): Promise<SafeResyncSchedule[]> => {
  try {
    await requireAdmin()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new SchedulerReadError()
  }

  try {
    return await readSchedules()
  } catch (error) {
    if (error instanceof SchedulerReadError) throw error
    throw new SchedulerReadError('read-failed', { cause: error })
  }
})
