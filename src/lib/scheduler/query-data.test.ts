import { beforeEach, describe, expect, it, mock } from 'bun:test'

const LAST_RUN = new Date('2099-08-17T12:00:00.000Z')
const NEXT_RUN = new Date('2099-08-17T13:00:00.000Z')

const host = {
  id: 'host-1',
  name: 'DC-APIC-01',
  host: '192.0.2.1',
  createdAt: new Date('2099-01-01T00:00:00.000Z'),
}

const schedule = {
  id: 'schedule-1',
  apicHostId: host.id,
  enabled: true,
  intervalMinutes: 60,
  encUsername: 'encrypted:svc-apic',
  encPassword: 'encrypted:password',
  nextRunAt: NEXT_RUN,
  lastRunAt: LAST_RUN,
  lastStatus: 'success',
  lastDetail: 'previous run',
  runningAt: null,
}

class AuthenticationRequiredError extends Error {}
let authError: unknown = null
const requireAdmin = mock(async () => {
  if (authError) throw authError
  return { id: 'admin-1', role: 'admin', userName: 'admin' }
})

let findManyError: unknown = null
const apicHostFindMany = mock(async () => {
  if (findManyError) throw findManyError
  return [{ ...host, schedule }]
})

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireAdmin }))
mock.module('@/lib/prisma', () => ({ prisma: { apicHost: { findMany: apicHostFindMany } } }))
mock.module('@/lib/crypto', () => ({
  encrypt: (value: string) => `encrypted:${value}`,
  decrypt: (value: string) => value.replace(/^encrypted:/, ''),
}))

const query = await import('./query')

beforeEach(() => {
  authError = null
  findManyError = null
})

describe('scheduler authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authError = new AuthenticationRequiredError('nope')
    await expect(query.getResyncSchedules()).rejects.toBeInstanceOf(query.SchedulerReadError)
  })

  it('propagates a non-admin session unchanged, not as a read error', async () => {
    authError = new Error('Forbidden')
    await expect(query.getResyncSchedules()).rejects.toThrow('Forbidden')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getResyncSchedules().catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getResyncSchedules', () => {
  it('returns a fresh safe snapshot for every call', async () => {
    const schedules = await query.getResyncSchedules()
    expect(schedules).toHaveLength(1)
    expect(schedules[0]).toEqual(expect.objectContaining({
      apicHostId: host.id,
      intervalMinutes: 60,
      lastRunAt: LAST_RUN,
      nextRunAt: NEXT_RUN,
    }))
  })
})
