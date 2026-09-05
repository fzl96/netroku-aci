import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { LegacyDevicePageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})

const storedDevice = {
  id: 'd1',
  site: 'hq',
  hostname: 'edge-1',
  managementIp: '10.0.0.1',
  deviceType: 'switch',
  vendor: 'cisco',
  model: 'c9300',
  serialNumber: 'SN1',
  softwareVersion: '17.9',
  location: 'rack-1',
  active: true,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-02T00:00:00Z'),
  lastHealthSyncAt: new Date('2026-01-03T00:00:00Z'),
  lastInterfaceSyncAt: null,
  lastEndpointSyncAt: null,
  secret: 'omit-device',
}

let findManyError: unknown = null
const deviceFindMany = mock(
  async (args: { distinct?: string[]; select?: Record<string, boolean> }) => {
    if (findManyError) throw findManyError
    if (args.distinct?.includes('site')) return [{ site: 'hq' }, { site: 'dc1' }]
    if (args.distinct?.includes('deviceType'))
      return [{ deviceType: 'router' }, { deviceType: 'switch' }]
    return [storedDevice]
  },
)
const deviceCount = mock(async (args?: { where?: Record<string, unknown> }) =>
  args?.where ? 1 : 9,
)

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({
  prisma: {
    legacyDevice: { findMany: deviceFindMany, count: deviceCount },
  },
}))
mock.module('next/cache', () => ({
  unstable_cache: (
    fn: () => unknown,
    key: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    cacheCalls.push({ key, options })
    return fn
  },
  revalidateTag: () => {},
}))

const query = await import('./query')

const base: LegacyDevicePageParams = {
  query: '',
  sites: [],
  deviceTypes: [],
  page: 1,
  pageSize: 50,
}

beforeEach(() => {
  authenticationError = null
  findManyError = null
  cacheCalls.length = 0
})

describe('legacy device authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getLegacyDeviceResults(base)).rejects.toBeInstanceOf(
      query.LegacyDeviceReadError,
    )
    await expect(query.getLegacyDeviceSummary()).rejects.toBeInstanceOf(query.LegacyDeviceReadError)
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getLegacyDeviceSummary()).rejects.toThrow('database on fire')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getLegacyDeviceResults(base).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(query.LegacyDeviceReadError)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getLegacyDeviceResults', () => {
  it('serializes rows into safe shapes and drops unselected columns', async () => {
    const results = await query.getLegacyDeviceResults(base)
    expect(results.total).toBe(1)
    expect(results.page).toBe(1)
    expect(results.rows[0]).toEqual({
      id: 'd1',
      site: 'hq',
      hostname: 'edge-1',
      managementIp: '10.0.0.1',
      deviceType: 'switch',
      vendor: 'cisco',
      model: 'c9300',
      serialNumber: 'SN1',
      softwareVersion: '17.9',
      location: 'rack-1',
      active: true,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      lastHealthSyncAt: '2026-01-03T00:00:00.000Z',
      lastInterfaceSyncAt: null,
      lastEndpointSyncAt: null,
    })
    expect(results.rows[0]).not.toHaveProperty('secret')
  })

  it('pages through Prisma rather than in memory', async () => {
    await query.getLegacyDeviceResults({ ...base, page: 3, pageSize: 10 })
    const call = deviceFindMany.mock.calls.at(-1)?.[0] as { skip?: number; take?: number }
    expect(call.skip).toBe(20)
    expect(call.take).toBe(10)
  })

  it('keys the cache by every filter that changes the row set', async () => {
    await query.getLegacyDeviceResults({
      ...base,
      query: 'edge',
      sites: ['dc1', 'hq'],
      deviceTypes: ['switch'],
      page: 2,
      pageSize: 100,
    })
    expect(cacheCalls.at(-1)?.key).toEqual([
      'legacy-devices',
      'results',
      'edge',
      'dc1,hq',
      'switch',
      '2',
      '100',
    ])
    expect(cacheCalls.at(-1)?.options).toEqual({
      tags: ['legacy-devices:all'],
      revalidate: 28_800,
    })
  })
})

describe('getLegacyDeviceSummary', () => {
  it('counts the fleet, sites, and incomplete collections', async () => {
    expect(await query.getLegacyDeviceSummary()).toEqual({
      total: 9,
      sites: 2,
      withHealth: 1,
      incomplete: 1,
    })
    expect(cacheCalls.at(-1)?.options.tags).toEqual(['legacy-devices:all'])
  })
})

describe('getLegacyDeviceFilterOptions', () => {
  it('returns the distinct site and device-type options', async () => {
    expect(await query.getLegacyDeviceFilterOptions()).toEqual({
      siteOptions: ['hq', 'dc1'],
      typeOptions: ['router', 'switch'],
    })
  })
})
