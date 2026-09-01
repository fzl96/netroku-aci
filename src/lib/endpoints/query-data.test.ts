import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import type { EndpointPageParams } from './params'

const HOSTS = [
  { id: 'host-2', name: 'APIC Two', host: '192.0.2.2' },
  { id: 'host-1', name: 'APIC One', host: '192.0.2.1' },
]

const ENDPOINT_ROWS = [
  {
    id: 'endpoint-1',
    apicHostId: 'host-1',
    mac: '00:00:00:00:00:01',
    ip: '192.0.2.10',
    vlan: 'vlan-10',
    dn: 'uni/tn-a/ap-b/epg-c/cep-1',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Servers',
    isActive: true,
    firstSeenAt: new Date('2026-01-01T00:00:00.000Z'),
    lastSeenAt: new Date('2026-01-02T00:00:00.000Z'),
    clearedAt: null,
  },
  {
    id: 'endpoint-2',
    apicHostId: 'host-1',
    mac: '00:00:00:00:00:02',
    ip: '192.0.2.11',
    vlan: 'vlan-20',
    dn: 'uni/tn-a/ap-b/epg-d/cep-2',
    node: '101',
    interface: 'eth1/1',
    epgDescr: 'Databases',
    isActive: false,
    firstSeenAt: new Date('2026-01-01T01:00:00.000Z'),
    lastSeenAt: new Date('2026-01-03T00:00:00.000Z'),
    clearedAt: new Date('2026-01-04T00:00:00.000Z'),
  },
]

let authenticated = true
let hostRows = HOSTS
let endpointRows = ENDPOINT_ROWS
let resultTotal = 12
let activeTotal = 7
let historicalTotal = 5

const requireSession = mock(async () => {
  if (!authenticated) throw new Error('Unauthorized')
  return { id: 'user-1', role: 'member', userName: 'operator' }
})

const apicHostFindMany = mock(async () => hostRows)
const endpointCount = mock(async ({ where }: { where: { isActive?: boolean } }) => {
  if (where.isActive === true) return activeTotal
  if (where.isActive === false) return historicalTotal
  return resultTotal
})
const endpointFindMany = mock(async ({ select }: {
  select?: { vlan?: boolean; node?: boolean; interface?: boolean }
}) => {
  if (select?.vlan && !select.node && !select.interface) {
    return [{ vlan: 'vlan-20' }, { vlan: 'vlan-10' }]
  }
  if (select?.node && !select.vlan && !select.interface) {
    return [{ node: '102-101' }, { node: '103' }]
  }
  if (select?.interface && !select.vlan && !select.node) {
    return [{ interface: 'eth1/10' }, { interface: 'eth1/2' }]
  }
  return endpointRows
})

const prisma = {
  apicHost: { findMany: apicHostFindMany },
  endpoint: { count: endpointCount, findMany: endpointFindMany },
}

type CacheCall = {
  keyParts: string[]
  options: { tags?: string[]; revalidate?: number }
}
const cacheCalls: CacheCall[] = []
const unstableCache = mock((
  operation: () => Promise<unknown>,
  keyParts: string[],
  options: CacheCall['options'],
) => {
  cacheCalls.push({ keyParts, options })
  return operation
})

mock.module('@/lib/auth', () => ({ requireSession }))
mock.module('@/lib/prisma', () => ({ prisma }))
mock.module('next/cache', () => ({ unstable_cache: unstableCache }))
mock.module('server-only', () => ({}))

const {
  getEndpointExportData,
  getEndpointOverview,
  getEndpointResults,
  resolveEndpointHost,
} = await import('./query')

const BASE_PARAMS: EndpointPageParams = {
  hostId: 'host-1',
  view: 'endpoint',
  query: '',
  page: 1,
  pageSize: 10,
  vlans: [],
  nodes: [],
  interfaces: [],
  statuses: [],
}

beforeEach(() => {
  authenticated = true
  hostRows = HOSTS
  endpointRows = ENDPOINT_ROWS
  resultTotal = 12
  activeTotal = 7
  historicalTotal = 5
  cacheCalls.length = 0
  requireSession.mockClear()
  apicHostFindMany.mockClear()
  endpointCount.mockClear()
  endpointFindMany.mockClear()
  unstableCache.mockClear()
})

afterAll(() => mock.restore())

describe('resolveEndpointHost', () => {
  it('authenticates and returns the selected safe host shape', async () => {
    await expect(resolveEndpointHost('host-1')).resolves.toEqual({
      kind: 'selected',
      host: HOSTS[1],
      hosts: HOSTS,
    })
    expect(requireSession).toHaveBeenCalledTimes(1)
    expect(apicHostFindMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, host: true },
    })
  })

  it('returns a canonical first-host redirect for a missing or unknown host', async () => {
    await expect(resolveEndpointHost('')).resolves.toEqual({
      kind: 'redirect',
      location: '/endpoints?apic=host-2',
      hosts: HOSTS,
    })
    await expect(resolveEndpointHost('missing')).resolves.toEqual({
      kind: 'redirect',
      location: '/endpoints?apic=host-2',
      hosts: HOSTS,
    })
  })

  it('returns an empty resolution when no APIC hosts exist', async () => {
    hostRows = []
    await expect(resolveEndpointHost('')).resolves.toEqual({ kind: 'empty', hosts: [] })
  })
})

describe('getEndpointOverview', () => {
  it('authorizes before Prisma and rejects an unauthenticated read', async () => {
    authenticated = false
    await expect(getEndpointOverview('host-1')).rejects.toThrow('Unauthorized')
    expect(endpointCount).not.toHaveBeenCalled()
    expect(endpointFindMany).not.toHaveBeenCalled()
  })

  it('returns counts and normalized filter choices', async () => {
    await expect(getEndpointOverview('host-1')).resolves.toEqual({
      activeTotal: 7,
      historicalTotal: 5,
      choices: {
        vlans: ['vlan-20', 'vlan-10'],
        nodes: ['101', '102', '103'],
        interfaces: ['eth1/10', 'eth1/2'],
      },
    })
  })

  it('uses the eight-hour purpose and host cache tags', async () => {
    await getEndpointOverview('host-1')
    expect(cacheCalls).toContainEqual({
      keyParts: ['endpoints', 'overview', 'host-1'],
      options: {
        tags: ['endpoints:all', 'endpoints:host:host-1'],
        revalidate: 28_800,
      },
    })
  })
})

describe('getEndpointResults', () => {
  it('returns serialized endpoint rows with clamped pagination', async () => {
    const result = await getEndpointResults({ ...BASE_PARAMS, page: 99 })

    expect(result).toEqual({
      view: 'endpoint',
      rows: ENDPOINT_ROWS.map(row => ({
        id: row.id,
        mac: row.mac,
        ip: row.ip,
        vlan: row.vlan,
        dn: row.dn,
        node: row.node,
        interface: row.interface,
        epgDescr: row.epgDescr,
        isActive: row.isActive,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
        clearedAt: row.clearedAt?.toISOString() ?? null,
      })),
      pagination: { page: 2, pageSize: 10, total: 12, totalPages: 2 },
    })
    expect(endpointFindMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 10,
      take: 10,
      orderBy: { lastSeenAt: 'desc' },
    }))
  })

  it('groups port rows before pagination and keeps nested dates serialized', async () => {
    resultTotal = 2
    const result = await getEndpointResults({
      ...BASE_PARAMS,
      view: 'port',
      pageSize: 'all',
    })

    expect(result).toEqual({
      view: 'port',
      rows: [expect.objectContaining({
        id: '101:eth1/1',
        endpointCount: 2,
        activeCount: 1,
        historicalCount: 1,
        lastSeenAt: '2026-01-03T00:00:00.000Z',
        endpoints: expect.arrayContaining([
          expect.objectContaining({ firstSeenAt: '2026-01-01T00:00:00.000Z' }),
        ]),
      })],
      pagination: { page: 1, pageSize: 'all', total: 1, totalPages: 1 },
    })
  })

  it('uses normalized parameters in an eight-hour tagged cache key', async () => {
    await getEndpointResults({ ...BASE_PARAMS, query: 'mac' })
    expect(cacheCalls[0]).toEqual({
      keyParts: [
        'endpoints',
        'results',
        'host-1',
        'endpoint',
        'mac',
        '1',
        '10',
        '',
        '',
        '',
        '',
      ],
      options: {
        tags: ['endpoints:all', 'endpoints:host:host-1'],
        revalidate: 28_800,
      },
    })
  })
})

describe('getEndpointExportData', () => {
  it('validates the host and returns every matching serialized row without pagination', async () => {
    await expect(getEndpointExportData({
      hostId: 'host-1',
      scope: 'filtered',
      filters: { status: ['active'] },
    })).resolves.toEqual({
      kind: 'ready',
      host: HOSTS[1],
      rows: expect.arrayContaining([
        expect.objectContaining({
          id: 'endpoint-1',
          firstSeenAt: '2026-01-01T00:00:00.000Z',
        }),
      ]),
    })
    expect(endpointFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { apicHostId: 'host-1', isActive: true },
      orderBy: { lastSeenAt: 'desc' },
    }))
  })

  it('returns host-not-found and empty result variants', async () => {
    await expect(getEndpointExportData({
      hostId: 'missing',
      scope: 'all',
    })).resolves.toEqual({ kind: 'host-not-found' })

    endpointRows = []
    await expect(getEndpointExportData({
      hostId: 'host-1',
      scope: 'all',
    })).resolves.toEqual({ kind: 'empty', host: HOSTS[1] })
  })
})
