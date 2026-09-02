import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { LegacyHealthPageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})

const sample = {
  id: 's1',
  collectedAt: new Date('2026-01-02T00:00:00Z'),
  uptime: '10 days',
  cpuPercent: 12.5,
  memoryPercent: 40,
  storagePercent: 20,
  temperatureCelsius: 31,
  fanStatuses: ['ok'],
  psuStatuses: ['ok'],
}

let deviceMissing = false
let findManyError: unknown = null
const deviceFindMany = mock(async (args: { distinct?: string[] }) => {
  if (findManyError) throw findManyError
  if (args.distinct?.includes('site')) return [{ site: 'dc1' }, { site: 'hq' }]
  return [
    {
      id: 'd1', hostname: 'edge-1', site: 'hq', managementIp: '10.0.0.1',
      healthSamples: [sample],
    },
    // A device with no sample must not become a health row.
    { id: 'd2', hostname: 'edge-2', site: 'hq', managementIp: '10.0.0.2', healthSamples: [] },
  ]
})
const deviceCount = mock(async () => 2)
const deviceFindUnique = mock(async () => (
  deviceMissing ? null : { id: 'd1', hostname: 'edge-1', site: 'hq' }
))
const healthSampleFindMany = mock(async () => [sample])
const healthSampleCount = mock(async () => 3)
const healthSampleFindFirst = mock(async () => ({ collectedAt: new Date('2026-01-05T00:00:00Z') }))
const logFindMany = mock(async () => [{
  id: 'l1',
  eventAt: new Date('2026-01-01T00:00:00Z'),
  collectedAt: new Date('2026-01-02T00:00:00Z'),
  severity: 'warning',
  message: 'link flap',
  raw: '%LINK-3-UPDOWN',
}])
const logCount = mock(async () => 1)

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({ prisma: {
  legacyDevice: { findMany: deviceFindMany, count: deviceCount, findUnique: deviceFindUnique },
  legacyHealthSample: {
    findMany: healthSampleFindMany, count: healthSampleCount, findFirst: healthSampleFindFirst,
  },
  legacyLogEntry: { findMany: logFindMany, count: logCount },
} }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown, key: string[], options: { tags: string[]; revalidate: number }) => {
    cacheCalls.push({ key, options }); return fn
  },
  revalidateTag: () => {},
}))

const query = await import('./query')

const base: LegacyHealthPageParams = {
  query: '', site: '', sort: 'collected', direction: 'desc', page: 1, pageSize: 50,
}

beforeEach(() => {
  authenticationError = null
  findManyError = null
  deviceMissing = false
  cacheCalls.length = 0
})

describe('legacy health authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getLegacyHealthResults(base))
      .rejects.toBeInstanceOf(query.LegacyHealthReadError)
    await expect(query.getLegacyHealthHistory('d1', { range: '24h' }))
      .rejects.toBeInstanceOf(query.LegacyHealthReadError)
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getLegacyHealthSummary()).rejects.toThrow('database on fire')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getLegacyHealthResults(base).catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getLegacyHealthResults', () => {
  it('drops devices without a health sample', async () => {
    const results = await query.getLegacyHealthResults(base)
    expect(results.rows).toHaveLength(1)
    expect(results.rows[0].deviceId).toBe('d1')
    expect(results.rows[0].sample.collectedAt).toBe('2026-01-02T00:00:00.000Z')
  })

  it('pages through Prisma rather than in memory', async () => {
    await query.getLegacyHealthResults({ ...base, page: 3, pageSize: 10 })
    const call = deviceFindMany.mock.calls.at(-1)?.[0] as { skip?: number; take?: number }
    expect(call.skip).toBe(20)
    expect(call.take).toBe(10)
  })

  it('keys the cache by every filter that changes the row set', async () => {
    await query.getLegacyHealthResults({
      ...base, query: 'edge', site: 'hq', sort: 'hostname', direction: 'asc', page: 2, pageSize: 100,
    })
    expect(cacheCalls.at(-1)?.key).toEqual([
      'legacy-health', 'results', 'edge', 'hq', 'hostname', 'asc', '2', '100',
    ])
    expect(cacheCalls.at(-1)?.options).toEqual({
      tags: ['legacy-health:all'], revalidate: 28_800,
    })
  })
})

describe('getLegacyHealthSummary', () => {
  it('counts monitored devices, samples, and logs', async () => {
    expect(await query.getLegacyHealthSummary()).toEqual({
      devices: 2, samples: 3, logs: 1, latest: '2026-01-05T00:00:00.000Z',
    })
  })
})

describe('getLegacyHealthHistory', () => {
  it('returns chart points oldest-first with paged samples and logs', async () => {
    const history = await query.getLegacyHealthHistory('d1', { range: '7d', samplePage: 2, logPage: 3 })
    expect(history?.device).toEqual({ id: 'd1', hostname: 'edge-1', site: 'hq' })
    expect(history?.range).toBe('7d')
    expect(history?.samplePage).toBe(2)
    expect(history?.logPage).toBe(3)
    expect(history?.pageSize).toBe(25)
    expect(history?.logs[0]).toEqual({
      id: 'l1',
      eventAt: '2026-01-01T00:00:00.000Z',
      collectedAt: '2026-01-02T00:00:00.000Z',
      severity: 'warning',
      message: 'link flap',
      raw: '%LINK-3-UPDOWN',
    })
  })

  it('clamps non-positive page numbers', async () => {
    const history = await query.getLegacyHealthHistory('d1', { range: '24h', samplePage: 0, logPage: -2 })
    expect(history?.samplePage).toBe(1)
    expect(history?.logPage).toBe(1)
  })

  it('reports a missing device and a blank id as absent rather than throwing', async () => {
    deviceMissing = true
    expect(await query.getLegacyHealthHistory('missing', { range: '24h' })).toBeNull()
    expect(await query.getLegacyHealthHistory('', { range: '24h' })).toBeNull()
  })
})
