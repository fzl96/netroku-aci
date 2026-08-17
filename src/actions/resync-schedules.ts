'use server'

import { cache } from 'react'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { toSafeSchedule, type SafeResyncSchedule } from '@/lib/apic/schedule-view'
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
    const host = await prisma.apicHost.findUnique({
      where: { id: apicHostId },
      include: { schedule: true },
    })
    if (!host) return { success: false, error: 'Host not found' }

    const { enabled, intervalMinutes, username, password } = parsed.data
    const existingSchedule = host.schedule

    let encPassword: string
    if (password) {
      encPassword = encrypt(password)
    } else if (existingSchedule) {
      encPassword = existingSchedule.encPassword
    } else {
      return { success: false, error: 'Password is required when creating a schedule' }
    }
    // Unreachable by construction: encPassword is only ever set via the branches above, both
    // of which produce a non-empty string (encrypt() never returns ''; existingSchedule.encPassword
    // is a required, non-blank column). Retained as fail-closed defense-in-depth on this
    // credential-handling boundary — if a future refactor of the branches above ever allows an
    // empty encPassword through, this stops it from being enabled rather than silently trusting it.
    if (enabled && !encPassword) {
      return { success: false, error: 'Credentials are required before enabling a schedule' }
    }

    const encUsername = encrypt(username)

    // Enabling for the first time should run soon rather than after a full interval.
    const nextRunAt = enabled ? (existingSchedule?.nextRunAt ?? new Date()) : null

    const schedule = await prisma.resyncSchedule.upsert({
      where: { apicHostId },
      create: {
        apicHostId,
        enabled,
        intervalMinutes,
        encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: actor.id,
      },
      update: {
        enabled,
        intervalMinutes,
        encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: actor.id,
      },
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync_schedule.update',
      target: `${host.name} (${host.host})`,
      detail: `${enabled ? 'enabled' : 'disabled'}, every ${intervalMinutes}m, runs as ${username}`,
    })

    return {
      success: true,
      data: toSafeSchedule({ id: host.id, name: host.name, host: host.host }, schedule),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** Queue an immediate run — the ticker picks it up within one tick. */
export async function runResyncScheduleNow(apicHostId: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const schedule = await prisma.resyncSchedule.findUnique({
      where: { apicHostId },
      include: { apicHost: true },
    })
    if (!schedule) return { success: false, error: 'No schedule for this host' }
    if (!schedule.enabled) return { success: false, error: 'Schedule is disabled' }
    if (schedule.runningAt) return { success: false, error: 'A run is already in progress' }

    await prisma.resyncSchedule.update({
      where: { apicHostId },
      data: { nextRunAt: new Date() },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync_schedule.update',
      target: `${schedule.apicHost.name} (${schedule.apicHost.host})`,
      detail: 'queued an immediate run',
    })
    return { success: true, data: undefined }
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
      action: 'resync_schedule.delete',
      target: existing ? `${existing.apicHost.name} (${existing.apicHost.host})` : apicHostId,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
