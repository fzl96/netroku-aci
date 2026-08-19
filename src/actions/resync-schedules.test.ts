import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'

const LAST_RUN = new Date('2099-08-17T12:00:00.000Z')
const OLD_NEXT_RUN = new Date('2099-08-17T13:00:00.000Z')

type ScheduleRow = {
  id: string
  apicHostId: string
  enabled: boolean
  intervalMinutes: number
  encUsername: string
  encPassword: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastStatus: string | null
  lastDetail: string | null
  runningAt: Date | null
  updatedByUserId: string | null
  createdAt: Date
  updatedAt: Date
}

const host = {
  id: 'host-1',
  name: 'DC-APIC-01',
  host: '192.0.2.1',
  createdAt: new Date('2099-01-01T00:00:00.000Z'),
  updatedAt: new Date('2099-01-01T00:00:00.000Z'),
  lastInterfaceSyncAt: null,
  lastNodeSyncAt: null,
  lastEpgSyncAt: null,
}

let schedule: ScheduleRow

const prisma = {
  apicHost: {
    findUnique: mock(async () => ({ ...host, schedule })),
    findMany: mock(async () => [{ ...host, schedule }]),
  },
  resyncSchedule: {
    upsert: mock(async ({ create, update }: {
      create: Omit<ScheduleRow, 'id' | 'createdAt' | 'updatedAt'>
      update: Partial<ScheduleRow>
    }) => {
      schedule = schedule
        ? { ...schedule, ...update }
        : {
            id: 'schedule-1',
            ...create,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
      return schedule
    }),
    findUnique: mock(async () => ({ ...schedule, apicHost: host })),
    update: mock(async ({ data, include }: {
      data: Partial<ScheduleRow>
      include?: { apicHost?: boolean }
    }) => {
      schedule = { ...schedule, ...data }
      return include?.apicHost ? { ...schedule, apicHost: host } : schedule
    }),
  },
}

mock.module('@/lib/auth', () => ({
  getSession: async () => ({
    user: { id: 'admin-1', role: 'admin', username: 'admin', name: 'Admin' },
  }),
}))
mock.module('@/lib/prisma', () => ({ prisma }))
mock.module('@/lib/audit', () => ({ recordAudit: async () => undefined }))
mock.module('@/lib/crypto', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}))

const {
  refreshResyncSchedules,
  runResyncScheduleNow,
  upsertResyncSchedule,
} = await import('./resync-schedules')

beforeEach(() => {
  schedule = {
    id: 'schedule-1',
    apicHostId: host.id,
    enabled: true,
    intervalMinutes: 60,
    encUsername: 'encrypted:svc-apic',
    encPassword: 'encrypted:password',
    nextRunAt: OLD_NEXT_RUN,
    lastRunAt: LAST_RUN,
    lastStatus: 'success',
    lastDetail: 'previous run',
    runningAt: null,
    updatedByUserId: 'admin-1',
    createdAt: new Date('2099-01-01T00:00:00.000Z'),
    updatedAt: new Date('2099-01-01T00:00:00.000Z'),
  }
})

afterAll(() => mock.restore())

describe('upsertResyncSchedule timing', () => {
  it('recomputes Next Run when changing an existing interval from 1h to 4h', async () => {
    const result = await upsertResyncSchedule(host.id, {
      enabled: true,
      intervalMinutes: 240,
      username: 'svc-apic',
    })

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data.intervalMinutes).toBe(240)
    expect(result.data.nextRunAt?.toISOString()).toBe('2099-08-17T16:00:00.000Z')
    expect(schedule.nextRunAt?.toISOString()).toBe('2099-08-17T16:00:00.000Z')
  })

  it('preserves Next Run when only credentials change', async () => {
    const result = await upsertResyncSchedule(host.id, {
      enabled: true,
      intervalMinutes: 60,
      username: 'new-user',
      password: 'new-password',
    })

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data.nextRunAt).toEqual(OLD_NEXT_RUN)
  })

  it('clears Next Run when disabling', async () => {
    const result = await upsertResyncSchedule(host.id, {
      enabled: false,
      intervalMinutes: 60,
      username: 'svc-apic',
    })

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data.nextRunAt).toBeNull()
  })

  it('queues immediately when re-enabling', async () => {
    schedule.enabled = false
    schedule.nextRunAt = null
    const before = Date.now()

    const result = await upsertResyncSchedule(host.id, {
      enabled: true,
      intervalMinutes: 60,
      username: 'svc-apic',
    })
    const after = Date.now()

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data.nextRunAt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.data.nextRunAt?.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('scheduler refresh actions', () => {
  it('returns authoritative queued state from Run now', async () => {
    const before = Date.now()

    const result = await runResyncScheduleNow(host.id)
    const after = Date.now()

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data.apicHostId).toBe(host.id)
    expect(result.data.lastRunAt).toEqual(LAST_RUN)
    expect(result.data.nextRunAt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.data.nextRunAt?.getTime()).toBeLessThanOrEqual(after)
  })

  it('returns a fresh safe snapshot for polling', async () => {
    const result = await refreshResyncSchedules()

    expect(result).toEqual(expect.objectContaining({ success: true }))
    if (!result.success) return
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toEqual(expect.objectContaining({
      apicHostId: host.id,
      intervalMinutes: 60,
      lastRunAt: LAST_RUN,
      nextRunAt: OLD_NEXT_RUN,
    }))
  })
})
