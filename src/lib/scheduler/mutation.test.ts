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
let transactionCalls = 0

const apicHost = {
  findUnique: mock(async () => ({ ...host, schedule })),
  findMany: mock(async () => [{ ...host, schedule }]),
}

const resyncSchedule = {
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
  deleteMany: mock(async () => ({ count: 1 })),
  update: mock(async ({ data, include }: {
    data: Partial<ScheduleRow>
    include?: { apicHost?: boolean }
  }) => {
    schedule = { ...schedule, ...data }
    return include?.apicHost ? { ...schedule, apicHost: host } : schedule
  }),
}

const tx = {
  apicHost,
  resyncSchedule,
  $queryRaw: mock(async (strings: TemplateStringsArray) => {
    const query = strings.join(' ')
    if (query.includes('FROM apic_host')) return [host]
    if (query.includes('FROM resync_schedule')) {
      return schedule
        ? [{
            id: schedule.id,
            enabled: schedule.enabled,
            intervalMinutes: schedule.intervalMinutes,
            encPassword: schedule.encPassword,
            nextRunAt: schedule.nextRunAt,
            lastRunAt: schedule.lastRunAt,
            runningAt: schedule.runningAt,
          }]
        : []
    }
    throw new Error('Unexpected query in schedule mutation test')
  }),
}
const prisma = {
  ...tx,
  $transaction: mock(async <T>(operation: (client: typeof tx) => Promise<T>) => {
    transactionCalls += 1
    return operation(tx)
  }),
}

class AuthenticationRequiredError extends Error {}
let authError: unknown = null
const requireAdmin = mock(async () => {
  if (authError) throw authError
  return { id: 'admin-1', role: 'admin', userName: 'admin' }
})

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireAdmin }))
mock.module('@/lib/prisma', () => ({ prisma }))
mock.module('@/lib/audit', () => ({ recordAudit: async () => undefined }))
mock.module('@/lib/crypto', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}))

const {
  deleteResyncScheduleRecord,
  runResyncScheduleNowRecord,
  upsertResyncScheduleRecord,
} = await import('./mutation')

beforeEach(() => {
  authError = null
  transactionCalls = 0
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

describe('scheduler mutation authorization', () => {
  it('requires the admin role, not just a session', async () => {
    authError = new Error('Forbidden')
    await expect(upsertResyncScheduleRecord(host.id, {
      enabled: true, intervalMinutes: 60, username: 'svc-apic',
      password: undefined,
    })).rejects.toThrow('Forbidden')
  })
})

describe('upsertResyncScheduleRecord timing', () => {
  it('serializes schedule reads and edits in one transaction', async () => {
    const result = await upsertResyncScheduleRecord(host.id, {
      enabled: true,
      intervalMinutes: 240,
      username: 'svc-apic',
      password: undefined,
    })

    expect(result.intervalMinutes).toBe(240)
    expect(transactionCalls).toBe(1)
  })

  it('recomputes Next Run when changing an existing interval from 1h to 4h', async () => {
    const result = await upsertResyncScheduleRecord(host.id, {
      enabled: true,
      intervalMinutes: 240,
      username: 'svc-apic',
      password: undefined,
    })

    expect(result.nextRunAt?.toISOString()).toBe('2099-08-17T16:00:00.000Z')
    expect(schedule.nextRunAt?.toISOString()).toBe('2099-08-17T16:00:00.000Z')
  })

  it('preserves Next Run when only credentials change', async () => {
    const result = await upsertResyncScheduleRecord(host.id, {
      enabled: true,
      intervalMinutes: 60,
      username: 'new-user',
      password: 'new-password',
    })

    expect(result.nextRunAt).toEqual(OLD_NEXT_RUN)
  })

  it('clears Next Run when disabling', async () => {
    const result = await upsertResyncScheduleRecord(host.id, {
      enabled: false,
      intervalMinutes: 60,
      username: 'svc-apic',
      password: undefined,
    })

    expect(result.nextRunAt).toBeNull()
  })

  it('queues immediately when re-enabling', async () => {
    schedule.enabled = false
    schedule.nextRunAt = null
    const before = Date.now()

    const result = await upsertResyncScheduleRecord(host.id, {
      enabled: true,
      intervalMinutes: 60,
      username: 'svc-apic',
      password: undefined,
    })
    const after = Date.now()

    expect(result.nextRunAt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.nextRunAt?.getTime()).toBeLessThanOrEqual(after)
  })
})

describe('runResyncScheduleNowRecord', () => {
  it('returns authoritative queued state from Run now', async () => {
    const before = Date.now()

    const result = await runResyncScheduleNowRecord(host.id)
    const after = Date.now()

    expect(result.apicHostId).toBe(host.id)
    expect(result.lastRunAt).toEqual(LAST_RUN)
    expect(result.nextRunAt?.getTime()).toBeGreaterThanOrEqual(before)
    expect(result.nextRunAt?.getTime()).toBeLessThanOrEqual(after)
    expect(transactionCalls).toBe(1)
  })

  it('does not queue a disabled or already-running schedule', async () => {
    schedule.enabled = false
    await expect(runResyncScheduleNowRecord(host.id)).rejects.toThrow('Schedule is disabled')
    expect(schedule.nextRunAt).toEqual(OLD_NEXT_RUN)
    expect(transactionCalls).toBe(1)

    transactionCalls = 0
    schedule.enabled = true
    schedule.runningAt = new Date('2099-08-17T12:30:00.000Z')
    await expect(runResyncScheduleNowRecord(host.id)).rejects.toThrow('A run is already in progress')
    expect(schedule.nextRunAt).toEqual(OLD_NEXT_RUN)
    expect(transactionCalls).toBe(1)
  })
})

describe('deleteResyncScheduleRecord', () => {
  it('reports a missing schedule rather than a Prisma error', async () => {
    resyncSchedule.deleteMany.mockImplementationOnce(async () => ({ count: 0 }))
    await expect(deleteResyncScheduleRecord(host.id)).rejects.toThrow('No schedule for this host')
  })
})
