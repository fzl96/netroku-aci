import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { LegacyEndpointPageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})

const storedEndpoint = {
  id: 'e1',
  deviceId: 'd1',
  mac: '00:11:22:33:44:55',
  macFlag: '*',
  ip: '10.0.0.5',
  vlan: '100',
  vlanName: 'users',
  interface: 'Gi1/0/1',
  learningType: 'dynamic',
  isActive: true,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-02T00:00:00Z'),
  clearedAt: null,
  device: { hostname: 'edge-1', site: 'hq', managementIp: '10.0.0.1' },
  secret: 'omit-endpoint',
}

let findManyError: unknown = null
const endpointFindMany = mock(async (args: { distinct?: string[] }) => {
  if (findManyError) throw findManyError
  if (args.distinct?.includes('vlan')) return [{ vlan: '100' }, { vlan: '20' }]
  if (args.distinct?.includes('interface')) return [{ interface: 'Gi1/0/2' }, { interface: 'Gi1/0/1' }]
  return [storedEndpoint]
})
const endpointCount = mock(async (args?: { where?: { isActive?: boolean } }) => {
  if (args?.where?.isActive === true) return 4
  if (args?.where?.isActive === false) return 2
  return args?.where ? 1 : 6
})
const deviceFindMany = mock(async () => [
  { id: 'd1', hostname: 'edge-1', site: 'hq' },
  { id: 'd2', hostname: 'edge-2', site: '' },
])

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({ prisma: {
  legacyEndpoint: { findMany: endpointFindMany, count: endpointCount },
  legacyDevice: { findMany: deviceFindMany },
} }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown, key: string[], options: { tags: string[]; revalidate: number }) => {
    cacheCalls.push({ key, options }); return fn
  },
  revalidateTag: () => {},
}))

const query = await import('./query')

const base: LegacyEndpointPageParams = {
  query: '', site: '', device: '', vlan: '', interface: '',
  status: 'active', sort: 'lastSeen', direction: 'desc', page: 1, pageSize: 50,
}

beforeEach(() => {
  authenticationError = null
  findManyError = null
  cacheCalls.length = 0
})

describe('legacy endpoint authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getLegacyEndpointResults(base))
      .rejects.toBeInstanceOf(query.LegacyEndpointReadError)
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getLegacyEndpointSummary()).rejects.toThrow('database on fire')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getLegacyEndpointResults(base).catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getLegacyEndpointResults', () => {
  it('flattens the device relation into a safe row shape', async () => {
    const results = await query.getLegacyEndpointResults(base)
    expect(results.rows[0]).toEqual({
      id: 'e1',
      deviceId: 'd1',
      hostname: 'edge-1',
      site: 'hq',
      managementIp: '10.0.0.1',
      mac: '00:11:22:33:44:55',
      macFlag: '*',
      ip: '10.0.0.5',
      vlan: '100',
      vlanName: 'users',
      interface: 'Gi1/0/1',
      learningType: 'dynamic',
      isActive: true,
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      clearedAt: null,
    })
    expect(results.rows[0]).not.toHaveProperty('secret')
    expect(results.rows[0]).not.toHaveProperty('device')
  })

  it('pages through Prisma rather than in memory', async () => {
    await query.getLegacyEndpointResults({ ...base, page: 3, pageSize: 10 })
    const call = endpointFindMany.mock.calls.at(-1)?.[0] as { skip?: number; take?: number }
    expect(call.skip).toBe(20)
    expect(call.take).toBe(10)
  })

  it('keys the cache by every filter that changes the row set', async () => {
    await query.getLegacyEndpointResults({
      ...base, query: 'aa', site: 'hq', device: 'd1', vlan: '100',
      interface: 'Gi1/0/1', status: 'all', sort: 'mac', direction: 'asc', page: 2, pageSize: 100,
    })
    expect(cacheCalls.at(-1)?.key).toEqual([
      'legacy-endpoints', 'results', 'aa', 'hq', 'd1', '100', 'Gi1/0/1',
      'all', 'mac', 'asc', '2', '100',
    ])
    expect(cacheCalls.at(-1)?.options).toEqual({
      tags: ['legacy-endpoints:all'], revalidate: 28_800,
    })
  })
})

describe('getLegacyEndpointSummary', () => {
  it('splits the lifecycle counts and distinct VLANs', async () => {
    expect(await query.getLegacyEndpointSummary()).toEqual({
      total: 6, active: 4, historical: 2, vlans: 2,
    })
  })
})

describe('getLegacyEndpointFilterOptions', () => {
  it('naturally sorts option values and drops blanks', async () => {
    expect(await query.getLegacyEndpointFilterOptions()).toEqual({
      sites: ['hq'],
      devices: [
        { id: 'd1', hostname: 'edge-1', site: 'hq' },
        { id: 'd2', hostname: 'edge-2', site: '' },
      ],
      vlans: ['20', '100'],
      interfaces: ['Gi1/0/1', 'Gi1/0/2'],
    })
  })
})
