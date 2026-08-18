import { prisma } from '@/lib/prisma'
import { STALE_CLAIM_MINUTES, computeNextRunAt } from './schedule-timing'

export interface ClaimedSchedule {
  id: string
  apicHostId: string
  encUsername: string
  encPassword: string
  intervalMinutes: number
  hostName: string
  host: string
}

/**
 * Atomically claim the single most-overdue due schedule.
 *
 * One statement, so two overlapping ticks can never claim the same row. We claim one row
 * per call rather than all due rows at once: bulk-claiming would stamp `runningAt` on rows
 * that then wait behind earlier hosts, and once that wait exceeds the stale window another
 * tick would reclaim and double-run them.
 */
export async function claimNextDueSchedule(now: Date = new Date()): Promise<ClaimedSchedule | null> {
  const rows = await prisma.$queryRaw<ClaimedSchedule[]>`
    UPDATE resync_schedule AS s
       SET "runningAt" = ${now}
     WHERE s.id = (
       SELECT c.id
         FROM resync_schedule AS c
        WHERE c.enabled
          AND c."nextRunAt" IS NOT NULL
          AND c."nextRunAt" <= ${now}
          AND (
            c."runningAt" IS NULL
            OR c."runningAt" < ${new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000)}
          )
        ORDER BY c."nextRunAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING
      s.id,
      s."apicHostId",
      s."encUsername",
      s."encPassword",
      s."intervalMinutes",
      (SELECT h.name FROM apic_host AS h WHERE h.id = s."apicHostId") AS "hostName",
      (SELECT h.host FROM apic_host AS h WHERE h.id = s."apicHostId") AS "host"
  `
  return rows[0] ?? null
}

/** Record the outcome, schedule the next run, and release the claim. */
export async function finalizeSchedule(input: {
  id: string
  intervalMinutes: number
  status: 'success' | 'partial' | 'failure'
  detail: string
  completedAt?: Date
}): Promise<void> {
  const completedAt = input.completedAt ?? new Date()
  await prisma.resyncSchedule.update({
    where: { id: input.id },
    data: {
      lastRunAt: completedAt,
      lastStatus: input.status,
      lastDetail: input.detail.slice(0, 1000),
      nextRunAt: computeNextRunAt(completedAt, input.intervalMinutes),
      runningAt: null,
    },
  })
}
