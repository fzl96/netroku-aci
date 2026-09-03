import { beforeEach, describe, expect, it, mock } from 'bun:test'

class AuthenticationRequiredError extends Error {}

let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'user-1', role: 'member', userName: 'operator' }
})

const hostFindMany = mock(async () => [{
  id: 'host-1',
  name: 'Fabric One',
  host: 'apic.example.test',
  lastInterfaceSyncAt: new Date('2026-06-15T10:00:00.000Z'),
  lastNodeSyncAt: new Date('2026-06-15T11:00:00.000Z'),
  encryptedSecret: 'must-not-escape',
}])
const endpointGroupBy = mock(async (args: { by: string[] }) => {
  if (args.by.includes('isActive')) {
    return [
      { apicHostId: 'host-1', isActive: true, _count: { _all: 7 } },
      { apicHostId: 'host-1', isActive: false, _count: { _all: 2 } },
    ]
  }
  return [{
    apicHostId: 'host-1',
    _max: { lastSeenAt: new Date('2026-06-15T09:00:00.000Z') },
  }]
})
const endpointFindMany = mock(async (args: { select: Record<string, boolean> }) => {
  if (args.select.vlan) return [{ vlan: 'vlan-10' }, { vlan: '' }]
  if (args.select.node) return [{ node: '101' }, { node: '' }]
  return [{ interface: 'eth1/1' }, { interface: '' }]
})
const interfaceGroupBy = mock(async () => [
  { adminSt: 'up', operSt: 'up', _count: { _all: 3 } },
  { adminSt: 'up', operSt: 'down', _count: { _all: 1 } },
  { adminSt: 'down', operSt: 'down', _count: { _all: 2 } },
])
const interfaceSampleFindMany = mock(async () => [{
  interfaceId: 'interface-1',
  sampledAt: new Date('2026-06-15T12:00:00.000Z'),
  dRxErrors: BigInt(1),
  dTxErrors: BigInt(0),
  dRxDiscards: BigInt(0),
  dTxDiscards: BigInt(0),
  dRxCrcErrors: BigInt(0),
  dRxAlignErrors: BigInt(0),
}])
const nodeFindMany = mock(async () => [
  { apicHostId: 'host-1', role: 'leaf', fabricSt: 'active', state: null, hidden: 'omit' },
  { apicHostId: 'host-1', role: 'spine', fabricSt: 'inactive', state: null, hidden: 'omit' },
  { apicHostId: 'host-1', role: 'controller', fabricSt: '', state: 'in-service', hidden: 'omit' },
])
const hardwareFindMany = mock(async () => [
  { apicHostId: 'host-1', type: 'psu', healthy: false, hidden: 'omit' },
  { apicHostId: 'host-1', type: 'fan', healthy: true, hidden: 'omit' },
])

const prisma = {
  apicHost: { findMany: hostFindMany },
  endpoint: { groupBy: endpointGroupBy, findMany: endpointFindMany },
  interfaceSnapshot: { groupBy: interfaceGroupBy },
  interfaceSample: { findMany: interfaceSampleFindMany },
  nodeSnapshot: { findMany: nodeFindMany },
  hardwareComponent: { findMany: hardwareFindMany },
}

type CacheCall = {
  key: string[]
  options: { tags: string[]; revalidate: number }
}
const cacheCalls: CacheCall[] = []
const unstableCache = mock((
  operation: () => Promise<unknown>,
  key: string[],
  options: CacheCall['options'],
) => {
  cacheCalls.push({ key, options })
  return operation
})

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({
  AuthenticationRequiredError,
  requireSession,
  requireAdmin: async () => ({ id: 'admin', userName: 'admin' }),
}))
mock.module('@/lib/prisma', () => ({ prisma }))
mock.module('next/cache', () => ({ unstable_cache: unstableCache, revalidateTag: () => {} }))

const query = await import('./query')

beforeEach(() => {
  authenticationError = null
  cacheCalls.length = 0
  for (const fn of [
    requireSession,
    hostFindMany,
    endpointGroupBy,
    endpointFindMany,
    interfaceGroupBy,
    interfaceSampleFindMany,
    nodeFindMany,
    hardwareFindMany,
    unstableCache,
  ]) fn.mockClear()
})

describe('dashboard query interface', () => {
  it('authorizes before durable reads and maps only a missing session', async () => {
    authenticationError = new AuthenticationRequiredError('missing')
    await expect(query.getDashboardHosts()).rejects.toBeInstanceOf(query.DashboardReadError)
    expect(hostFindMany).not.toHaveBeenCalled()

    authenticationError = new Error('session database unavailable')
    await expect(query.getDashboardEndpoints()).rejects.toThrow('session database unavailable')
    expect(endpointGroupBy).not.toHaveBeenCalled()
  })

  it('returns serialized safe host and endpoint aggregates', async () => {
    const hosts = await query.getDashboardHosts()
    const endpoints = await query.getDashboardEndpoints()

    expect(hosts).toEqual([{
      id: 'host-1',
      name: 'Fabric One',
      host: 'apic.example.test',
      lastInterfaceSyncAt: '2026-06-15T10:00:00.000Z',
      lastNodeSyncAt: '2026-06-15T11:00:00.000Z',
    }])
    expect(endpoints).toEqual({
      active: 7,
      historical: 2,
      vlanCount: 1,
      nodeCount: 1,
      interfaceCount: 1,
      byHost: [{
        hostId: 'host-1',
        active: 7,
        latestSeenAt: '2026-06-15T09:00:00.000Z',
      }],
    })
    expect(JSON.stringify({ hosts, endpoints })).not.toContain('must-not-escape')
  })

  it('summarizes interface samples without leaking BigInt values', async () => {
    const result = await query.getDashboardInterfaces()
    expect(result).toEqual({
      total: 6,
      adminDown: 2,
      operDown: 1,
      noisy: 1,
    })
    expect(() => JSON.stringify(result)).not.toThrow()
  })

  it('returns node, role, hardware, and host aggregates as safe numbers', async () => {
    const result = await query.getDashboardNodes()

    expect(result).toEqual({
      nodesTotal: 3,
      nodesOnline: 2,
      leafCount: 1,
      spineCount: 1,
      controllerCount: 1,
      hardwareTotal: 2,
      failedHardware: 1,
      failedPsu: 1,
      failedFan: 0,
      byHost: [{
        hostId: 'host-1',
        nodesTotal: 3,
        nodesOnline: 2,
        failedHardware: 1,
      }],
    })
    expect(JSON.stringify(result)).not.toContain('omit')
  })

  it('uses eight-hour caches with dashboard and source tags', async () => {
    await Promise.all([
      query.getDashboardHosts(),
      query.getDashboardEndpoints(),
      query.getDashboardInterfaces(),
      query.getDashboardNodes(),
    ])

    expect(cacheCalls).toEqual([
      {
        key: ['dashboard', 'hosts'],
        options: {
          tags: [
            'dashboard:all',
            'apic-hosts:all',
            'endpoints:all',
            'interfaces:all',
            'nodes:all',
          ],
          revalidate: 28_800,
        },
      },
      {
        key: ['dashboard', 'endpoints'],
        options: { tags: ['dashboard:all', 'endpoints:all'], revalidate: 28_800 },
      },
      {
        key: ['dashboard', 'interfaces'],
        options: { tags: ['dashboard:all', 'interfaces:all'], revalidate: 28_800 },
      },
      {
        key: ['dashboard', 'nodes'],
        options: { tags: ['dashboard:all', 'nodes:all'], revalidate: 28_800 },
      },
    ])
  })
})
