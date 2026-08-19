import { describe, expect, it } from 'bun:test'
import { PrismaClient } from '@prisma/client'

const databaseUrl = process.env.SCHEDULER_INTEGRATION_DATABASE_URL
const integrationIt = databaseUrl ? it : it.skip

function withApplicationName(url: string, applicationName: string): string {
  const parsed = new URL(url)
  parsed.searchParams.set('application_name', applicationName)
  return parsed.toString()
}

async function waitForLockWait(db: PrismaClient, applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const rows = await db.$queryRaw<Array<{ waiting: boolean }>>`
      SELECT EXISTS (
        SELECT 1
          FROM pg_stat_activity
         WHERE application_name = ${applicationName}
           AND state = 'active'
           AND wait_event_type = 'Lock'
      ) AS waiting
    `
    if (rows[0]?.waiting) return
    await Bun.sleep(10)
  }
  throw new Error('Editor did not reach the PostgreSQL row-lock wait')
}

describe('schedule update PostgreSQL locking', () => {
  integrationIt('recomputes from a completion that commits before a waiting interval edit', async () => {
    if (!databaseUrl) throw new Error('Integration database URL is required')
    const finalizerDb = new PrismaClient({ datasourceUrl: databaseUrl })
    const hostId = crypto.randomUUID()
    const editorApplicationName = `scheduler_editor_${hostId.replaceAll('-', '')}`
    const editorDb = new PrismaClient({
      datasourceUrl: withApplicationName(databaseUrl, editorApplicationName),
    })
    let releaseFinalizer: (() => void) | null = null
    let markFinalizerLocked: (() => void) | null = null
    const finalizerLocked = new Promise<void>((resolve) => {
      markFinalizerLocked = resolve
    })
    const mayFinalize = new Promise<void>((resolve) => {
      releaseFinalizer = resolve
    })

    try {
      const host = await finalizerDb.apicHost.create({
        data: {
          id: hostId,
          name: 'Scheduler concurrency verification',
          host: `scheduler-${hostId}.invalid`,
          schedule: {
            create: {
              enabled: true,
              intervalMinutes: 60,
              encUsername: 'verification',
              encPassword: 'verification',
              lastRunAt: new Date('2026-08-17T12:00:00.000Z'),
              nextRunAt: new Date('2026-08-17T13:00:00.000Z'),
              runningAt: new Date('2026-08-17T12:55:00.000Z'),
            },
          },
        },
        include: { schedule: true },
      })
      if (!host.schedule) throw new Error('Schedule was not created')

      const finalization = finalizerDb.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM resync_schedule WHERE id = ${host.schedule?.id} FOR UPDATE
        `
        markFinalizerLocked?.()
        await mayFinalize
        await tx.resyncSchedule.update({
          where: { id: host.schedule?.id },
          data: {
            lastRunAt: new Date('2026-08-17T13:00:00.000Z'),
            nextRunAt: new Date('2026-08-17T14:00:00.000Z'),
            runningAt: null,
          },
        })
      })

      await finalizerLocked
      const { updateScheduleWithLock } = await import('./schedule-update')
      const edit = updateScheduleWithLock(editorDb, {
        apicHostId: hostId,
        enabled: true,
        intervalMinutes: 240,
        encUsername: 'verification',
        updatedByUserId: 'admin-1',
        now: new Date('2026-08-17T12:30:00.000Z'),
      })

      await waitForLockWait(finalizerDb, editorApplicationName)
      releaseFinalizer?.()
      await Promise.all([finalization, edit])

      const row = await editorDb.resyncSchedule.findUniqueOrThrow({ where: { apicHostId: hostId } })
      expect(row.intervalMinutes).toBe(240)
      expect(row.lastRunAt?.toISOString()).toBe('2026-08-17T13:00:00.000Z')
      expect(row.nextRunAt?.toISOString()).toBe('2026-08-17T17:00:00.000Z')
    } finally {
      releaseFinalizer?.()
      await finalizerDb.apicHost.deleteMany({ where: { id: hostId } })
      await Promise.all([finalizerDb.$disconnect(), editorDb.$disconnect()])
    }
  })

  integrationIt('finalizes with an interval edit that committed before completion', async () => {
    if (!databaseUrl) throw new Error('Integration database URL is required')
    const db = new PrismaClient({ datasourceUrl: databaseUrl })
    const hostId = crypto.randomUUID()

    try {
      const host = await db.apicHost.create({
        data: {
          id: hostId,
          name: 'Scheduler edit-first verification',
          host: `scheduler-${hostId}.invalid`,
          schedule: {
            create: {
              enabled: true,
              intervalMinutes: 60,
              encUsername: 'verification',
              encPassword: 'verification',
              lastRunAt: new Date('2026-08-17T12:00:00.000Z'),
              nextRunAt: new Date('2026-08-17T13:00:00.000Z'),
              runningAt: new Date('2026-08-17T12:55:00.000Z'),
            },
          },
        },
        include: { schedule: true },
      })
      if (!host.schedule) throw new Error('Schedule was not created')

      const { updateScheduleWithLock } = await import('./schedule-update')
      const edit = await updateScheduleWithLock(db, {
        apicHostId: hostId,
        enabled: true,
        intervalMinutes: 240,
        encUsername: 'verification',
        updatedByUserId: 'admin-1',
        now: new Date('2026-08-17T12:30:00.000Z'),
      })
      expect(edit.success).toBe(true)

      const scheduleClaim = await import('./schedule-claim')
      await scheduleClaim.finalizeScheduleWithLock(db, {
        id: host.schedule.id,
        status: 'success',
        detail: 'verification',
        completedAt: new Date('2026-08-17T13:00:00.000Z'),
      })

      const row = await db.resyncSchedule.findUniqueOrThrow({ where: { apicHostId: hostId } })
      expect(row.intervalMinutes).toBe(240)
      expect(row.lastRunAt?.toISOString()).toBe('2026-08-17T13:00:00.000Z')
      expect(row.nextRunAt?.toISOString()).toBe('2026-08-17T17:00:00.000Z')
    } finally {
      await db.apicHost.deleteMany({ where: { id: hostId } })
      await db.$disconnect()
    }
  })
})
