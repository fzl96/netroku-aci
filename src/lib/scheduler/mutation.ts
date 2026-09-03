import 'server-only'

import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { encrypt } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { queueScheduleNowWithLock, updateScheduleWithLock } from '@/lib/apic/schedule-update'
import { toSafeSchedule, type SafeResyncSchedule } from '@/lib/apic/schedule-view'
import {
  resyncScheduleUpdateSchema,
  type ResyncScheduleUpdateFormValues,
} from '@/lib/schemas/resync-schedule'

export async function upsertResyncScheduleRecord(
  apicHostId: string,
  data: ResyncScheduleUpdateFormValues,
): Promise<SafeResyncSchedule> {
  const actor = await requireAdmin()
  const parsed = resyncScheduleUpdateSchema.safeParse(data)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid data')

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
  if (!updated.success) throw new Error(updated.error)

  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'resync.schedule.update',
    target: `${updated.host.name} (${updated.host.host})`,
    detail: `${enabled ? 'enabled' : 'disabled'}, every ${intervalMinutes}m, runs as ${username}`,
  })

  return toSafeSchedule(updated.host, updated.schedule)
}

/** Queue an immediate run — the ticker picks it up within one tick. */
export async function runResyncScheduleNowRecord(apicHostId: string): Promise<SafeResyncSchedule> {
  const actor = await requireAdmin()
  const queued = await queueScheduleNowWithLock(prisma, { apicHostId, now: new Date() })
  if (!queued.success) throw new Error(queued.error)

  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'resync.schedule.update',
    target: `${queued.host.name} (${queued.host.host})`,
    detail: 'queued an immediate run',
  })

  return toSafeSchedule(queued.host, queued.schedule)
}

export async function deleteResyncScheduleRecord(apicHostId: string): Promise<void> {
  const actor = await requireAdmin()
  const existing = await prisma.resyncSchedule.findUnique({
    where: { apicHostId },
    include: { apicHost: true },
  })
  const result = await prisma.resyncSchedule.deleteMany({ where: { apicHostId } })
  if (result.count === 0) throw new Error('No schedule for this host')

  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'resync.schedule.delete',
    target: existing ? `${existing.apicHost.name} (${existing.apicHost.host})` : apicHostId,
  })
}
