import type { PrismaClient, ResyncSchedule } from '@prisma/client'
import { computeEditedNextRunAt } from './schedule-timing'

type ScheduleUpdateDb = Pick<PrismaClient, '$transaction'>

type LockedSchedule = Pick<
  ResyncSchedule,
  'enabled' | 'intervalMinutes' | 'encPassword' | 'nextRunAt' | 'lastRunAt'
>

type HostIdentity = {
  id: string
  name: string
  host: string
}

export type ScheduleUpdateResult =
  | { success: true; host: HostIdentity; schedule: ResyncSchedule }
  | { success: false; error: string }

type LockedQueueSchedule = Pick<ResyncSchedule, 'id' | 'enabled' | 'runningAt'>

/** Serialize schedule edits with completion so neither can persist a stale deadline. */
export async function updateScheduleWithLock(
  db: ScheduleUpdateDb,
  input: {
    apicHostId: string
    enabled: boolean
    intervalMinutes: number
    encUsername: string
    encPassword?: string
    updatedByUserId: string
    now: Date
  },
): Promise<ScheduleUpdateResult> {
  return db.$transaction(async (tx) => {
    const hosts = await tx.$queryRaw<HostIdentity[]>`
      SELECT id, name, host
        FROM apic_host
       WHERE id = ${input.apicHostId}
       FOR UPDATE
    `
    const host = hosts[0]
    if (!host) return { success: false, error: 'Host not found' }

    const schedules = await tx.$queryRaw<LockedSchedule[]>`
      SELECT enabled, "intervalMinutes", "encPassword", "nextRunAt", "lastRunAt"
        FROM resync_schedule
       WHERE "apicHostId" = ${input.apicHostId}
       FOR UPDATE
    `
    const existing = schedules[0] ?? null

    const encPassword = input.encPassword ?? existing?.encPassword
    if (!encPassword) {
      return { success: false, error: 'Password is required when creating a schedule' }
    }

    const nextRunAt = computeEditedNextRunAt({
      enabled: input.enabled,
      wasEnabled: existing?.enabled ?? false,
      intervalMinutes: input.intervalMinutes,
      previousIntervalMinutes: existing?.intervalMinutes ?? input.intervalMinutes,
      existingNextRunAt: existing?.nextRunAt ?? null,
      lastRunAt: existing?.lastRunAt ?? null,
      now: input.now,
    })

    const schedule = await tx.resyncSchedule.upsert({
      where: { apicHostId: input.apicHostId },
      create: {
        apicHostId: input.apicHostId,
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes,
        encUsername: input.encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: input.updatedByUserId,
      },
      update: {
        enabled: input.enabled,
        intervalMinutes: input.intervalMinutes,
        encUsername: input.encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: input.updatedByUserId,
      },
    })

    return { success: true, host, schedule }
  })
}

/** Atomically validate and queue an immediate run against concurrent claims and edits. */
export async function queueScheduleNowWithLock(
  db: ScheduleUpdateDb,
  input: { apicHostId: string; now: Date },
): Promise<ScheduleUpdateResult> {
  return db.$transaction(async (tx) => {
    const hosts = await tx.$queryRaw<HostIdentity[]>`
      SELECT id, name, host
        FROM apic_host
       WHERE id = ${input.apicHostId}
       FOR UPDATE
    `
    const host = hosts[0]
    if (!host) return { success: false, error: 'Host not found' }

    const schedules = await tx.$queryRaw<LockedQueueSchedule[]>`
      SELECT id, enabled, "runningAt"
        FROM resync_schedule
       WHERE "apicHostId" = ${input.apicHostId}
       FOR UPDATE
    `
    const existing = schedules[0]
    if (!existing) return { success: false, error: 'No schedule for this host' }
    if (!existing.enabled) return { success: false, error: 'Schedule is disabled' }
    if (existing.runningAt) return { success: false, error: 'A run is already in progress' }

    const schedule = await tx.resyncSchedule.update({
      where: { id: existing.id },
      data: { nextRunAt: input.now },
    })
    return { success: true, host, schedule }
  })
}
