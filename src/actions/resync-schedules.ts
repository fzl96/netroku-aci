'use server'

import { cache } from 'react'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { toSafeSchedule, type SafeResyncSchedule } from '@/lib/apic/schedule-view'
import { updateScheduleWithLock } from '@/lib/apic/schedule-update'
import {
  resyncScheduleUpdateSchema,
  type ResyncScheduleUpdateFormValues,
} from '@/lib/schemas/resync-schedule'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireAdmin(): Promise<{ id: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if ((session.user.role ?? 'member') !== 'admin') throw new Error('Forbidden')
  return {
    id: session.user.id,
    userName: session.user.username ?? session.user.name,
  }
}

async function _getResyncSchedules(): Promise<SafeResyncSchedule[]> {
  await requireAdmin()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'asc' },
    include: { schedule: true },
  })
  return hosts.map((h) => toSafeSchedule({ id: h.id, name: h.name, host: h.host }, h.schedule))
}

/** Cached per-request: safe to call from multiple server components. */
export const getResyncSchedules = cache(_getResyncSchedules)

/** Uncached snapshot for the mounted Scheduler page's background refresh loop. */
export async function refreshResyncSchedules(): Promise<ActionResult<SafeResyncSchedule[]>> {
  try {
    return { success: true, data: await _getResyncSchedules() }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function upsertResyncSchedule(
  apicHostId: string,
  data: ResyncScheduleUpdateFormValues,
): Promise<ActionResult<SafeResyncSchedule>> {
  try {
    const actor = await requireAdmin()
    const parsed = resyncScheduleUpdateSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' }
    }
    const { enabled, intervalMinutes, username, password } = parsed.data
    const encUsername = encrypt(username)
    const updated = await updateScheduleWithLock(prisma, {
      apicHostId,
      enabled,
      intervalMinutes,
      encUsername,
      encPassword: password ? encrypt(password) : undefined,
      updatedByUserId: actor.id,
      now: new Date(),
    })
    if (!updated.success) return updated

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync.schedule.update',
      target: `${updated.host.name} (${updated.host.host})`,
      detail: `${enabled ? 'enabled' : 'disabled'}, every ${intervalMinutes}m, runs as ${username}`,
    })

    return {
      success: true,
      data: toSafeSchedule(updated.host, updated.schedule),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** Queue an immediate run — the ticker picks it up within one tick. */
export async function runResyncScheduleNow(
  apicHostId: string,
): Promise<ActionResult<SafeResyncSchedule>> {
  try {
    const actor = await requireAdmin()
    const schedule = await prisma.resyncSchedule.findUnique({
      where: { apicHostId },
      include: { apicHost: true },
    })
    if (!schedule) return { success: false, error: 'No schedule for this host' }
    if (!schedule.enabled) return { success: false, error: 'Schedule is disabled' }
    if (schedule.runningAt) return { success: false, error: 'A run is already in progress' }

    const queued = await prisma.resyncSchedule.update({
      where: { apicHostId },
      data: { nextRunAt: new Date() },
      include: { apicHost: true },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync.schedule.update',
      target: `${schedule.apicHost.name} (${schedule.apicHost.host})`,
      detail: 'queued an immediate run',
    })
    return {
      success: true,
      data: toSafeSchedule(
        { id: queued.apicHost.id, name: queued.apicHost.name, host: queued.apicHost.host },
        queued,
      ),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteResyncSchedule(apicHostId: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.resyncSchedule.findUnique({
      where: { apicHostId },
      include: { apicHost: true },
    })
    const result = await prisma.resyncSchedule.deleteMany({ where: { apicHostId } })
    if (result.count === 0) return { success: false, error: 'No schedule for this host' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync.schedule.delete',
      target: existing ? `${existing.apicHost.name} (${existing.apicHost.host})` : apicHostId,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
