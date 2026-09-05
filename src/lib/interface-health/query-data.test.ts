import { beforeEach, describe, expect, it, mock } from 'bun:test'
import * as React from 'react'
import type { InterfaceHealthPageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})

let hosts = [{ id: 'h1', name: 'Fabric', host: 'apic.local' }]
const apicHostFindMany = mock(async () => hosts)
const apicHostFindFirst = mock(async (args: { select?: Record<string, boolean> }) =>
  args.select?.lastInterfaceSyncAt
    ? { lastInterfaceSyncAt: new Date('2026-01-01T00:00:00Z') }
    : { id: 'h1', name: 'Fabric' },
)

const crcSamples = [
  {
    interfaceId: 'i2',
    sampledAt: new Date('2026-01-01T00:00:00Z'),
    dRxCrcErrors: BigInt(5),
  },
  {
    interfaceId: 'i1',
    sampledAt: new Date('2026-01-02T00:00:00Z'),
    dRxCrcErrors: BigInt(2),
  },
]
const exportSample = {
  sampledAt: new Date('2026-01-05T00:00:00Z'),
  adminSt: 'up',
  operSt: 'up',
  operSpeed: '10G',
  rxBytes: BigInt(10),
  rxPkts: BigInt(11),
  rxErrors: BigInt(12),
  rxDiscards: BigInt(13),
  rxCrcErrors: BigInt(14),
  rxAlignErrors: BigInt(15),
  txBytes: BigInt(20),
  txPkts: BigInt(21),
  txErrors: BigInt(22),
  txDiscards: BigInt(23),
  dRxBytes: BigInt(30),
  dRxErrors: BigInt(31),
  dRxDiscards: BigInt(32),
  dRxCrcErrors: BigInt(33),
  dRxAlignErrors: BigInt(34),
  dTxBytes: BigInt(40),
  dTxErrors: BigInt(41),
  dTxDiscards: BigInt(42),
  internalSecret: 'omit-sample',
  interface: {
    node: 'leaf-1',
    ifName: 'eth1/1',
    usage: 'epg',
    description: 'server',
    dn: 'topology/leaf-1/eth1/1',
    internalSecret: 'omit-interface',
  },
}
const interfaceSampleFindMany = mock(
  async (args: { select?: Record<string, unknown>; include?: Record<string, unknown> }) =>
    args.select?.adminSt ? [exportSample] : crcSamples,
)

function snapshot(id: string, node: string, ifName: string, crc: bigint) {
  return {
    id,
    node,
    ifName,
    dn: `topology/${node}/${ifName}`,
    usage: 'epg',
    adminSt: 'up',
    operSt: 'up',
    operSpeed: '10G',
    description: '',
    guiCiscoPID: 'SFP-10G-SR-S',
    guiSN: 'ACW274905XX',
    lastLinkStChg: new Date('2026-01-03T00:00:00Z'),
    secret: 'omit-snapshot',
    samples: [
      {
        sampledAt: new Date('2026-01-04T00:00:00Z'),
        rxBytes: BigInt(10),
        rxErrors: BigInt(1),
        rxCrcErrors: crc,
        rxAlignErrors: BigInt(0),
        txBytes: BigInt(20),
        txErrors: BigInt(2),
        dRxBytes: BigInt(3),
        dRxErrors: BigInt(4),
        dRxDiscards: BigInt(5),
        dRxCrcErrors: crc,
        dRxAlignErrors: null,
        dTxBytes: BigInt(6),
        dTxErrors: BigInt(7),
        dTxDiscards: null,
      },
    ],
  }
}

const snapshots = [
  snapshot('i1', 'leaf-1', 'eth1/1', BigInt(2)),
  snapshot('i2', 'leaf-2', 'eth1/2', BigInt(5)),
]
const interfaceSnapshotFindMany = mock(
  async (args: { distinct?: string[] }) =>
    (args.distinct ? [{ node: 'leaf-2' }, { node: '' }, { node: 'leaf-1' }] : snapshots) as never,
)
const queryRaw = mock(async () => [{ interfaceId: 'i2' }])

const cacheCalls: Array<{
  key: string[]
  options: { tags: string[]; revalidate: number }
  invocationArgs: unknown[][]
}> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({
  AuthenticationRequiredError,
  requireSession,
  requireAdmin: async () => ({ id: 'admin', userName: 'admin' }),
}))
mock.module('@/lib/prisma', () => ({
  prisma: {
    apicHost: { findMany: apicHostFindMany, findFirst: apicHostFindFirst },
    interfaceSample: { findMany: interfaceSampleFindMany },
    interfaceSnapshot: { findMany: interfaceSnapshotFindMany },
    $queryRaw: queryRaw,
  },
}))
mock.module('next/cache', () => ({
  unstable_cache: (
    fn: (...args: unknown[]) => unknown,
    key: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    const invocationArgs: unknown[][] = []
    cacheCalls.push({ key, options, invocationArgs })
    return (...args: unknown[]) => {
      invocationArgs.push(args)
      return fn(...args)
    }
  },
  revalidateTag: () => {},
}))
mock.module('react', () => ({ ...React, cache: (fn: unknown) => fn }))

const query = await import('./query')

const base: InterfaceHealthPageParams = {
  hostId: 'h1',
  query: '',
  nodes: [],
  page: 1,
  pageSize: 50,
  view: 'all',
  window: '7d',
  counterMode: 'delta',
  sort: { kind: 'natural' },
}

beforeEach(() => {
  authenticationError = null
  hosts = [{ id: 'h1', name: 'Fabric', host: 'apic.local' }]
  cacheCalls.length = 0
  requireSession.mockClear()
  interfaceSampleFindMany.mockClear()
})

describe('interface health authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getInterfaceOverview('h1')).rejects.toBeInstanceOf(query.InterfaceReadError)
    await expect(query.getInterfaceResults(base)).rejects.toBeInstanceOf(query.InterfaceReadError)
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getInterfaceOverview('h1')).rejects.toThrow('database on fire')
  })
})

describe('resolveInterfaceHost', () => {
  it('selects the requested host', async () => {
    expect(await query.resolveInterfaceHost('h1')).toEqual({
      kind: 'selected',
      host: { id: 'h1', name: 'Fabric', host: 'apic.local' },
      hosts,
    })
  })

  it('redirects to the first host when the request names none', async () => {
    expect(await query.resolveInterfaceHost('')).toEqual({
      kind: 'redirect',
      location: '/interface-health?apic=h1',
      hosts,
    })
  })

  it('reports emptiness when no hosts exist', async () => {
    hosts = []
    expect(await query.resolveInterfaceHost('h1')).toEqual({ kind: 'empty', hosts: [] })
  })
})

describe('getInterfaceOverview', () => {
  it('returns the sync stamp and sorted node filter options without blanks', async () => {
    expect(await query.getInterfaceOverview('h1')).toEqual({
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      availableNodes: ['leaf-1', 'leaf-2'],
    })
  })

  it('tags the overview with the shared and host-scoped dataset tags', async () => {
    await query.getInterfaceOverview('h1')
    expect(cacheCalls.at(-1)?.options).toEqual({
      tags: ['interfaces:all', 'interfaces:host:h1'],
      revalidate: 28_800,
    })
  })
})

describe('getInterfaceCrcWindow', () => {
  it('returns the aggregate trend and per-interface totals as strings', async () => {
    expect(await query.getInterfaceCrcWindow('h1', '7d')).toEqual({
      trend: [
        { sampledAt: '2026-01-01T00:00:00.000Z', crcErrorsDelta: 5 },
        { sampledAt: '2026-01-02T00:00:00.000Z', crcErrorsDelta: 2 },
      ],
      totals: [
        { interfaceId: 'i2', total: '5' },
        { interfaceId: 'i1', total: '2' },
      ],
    })
  })

  it('keys the window cache by host and window', async () => {
    await query.getInterfaceCrcWindow('h1', '30d')
    expect(cacheCalls.at(-1)?.key).toEqual(['interface-health', 'crc-window', 'h1', '30d'])
  })
})

describe('getInterfaceResults', () => {
  it('serializes rows into safe shapes and drops unselected columns', async () => {
    const results = await query.getInterfaceResults(base)
    expect(results.total).toBe(2)
    expect(results.rows[0]).toEqual({
      id: 'i1',
      node: 'leaf-1',
      ifName: 'eth1/1',
      dn: 'topology/leaf-1/eth1/1',
      usage: 'epg',
      adminSt: 'up',
      operSt: 'up',
      operSpeed: '10G',
      description: '',
      guiCiscoPID: 'SFP-10G-SR-S',
      guiSN: 'ACW274905XX',
      lastLinkStChg: '2026-01-03T00:00:00.000Z',
      lastSampledAt: '2026-01-04T00:00:00.000Z',
      rxBytes: '10',
      rxErrors: '1',
      rxCrcErrors: '2',
      rxAlignErrors: '0',
      txBytes: '20',
      txErrors: '2',
      dRxBytes: '3',
      dRxErrors: '4',
      dRxDiscards: '5',
      dRxCrcErrors: '2',
      dRxAlignErrors: null,
      dTxBytes: '6',
      dTxErrors: '7',
      dTxDiscards: null,
      crcWindowTotal: null,
      hasRecentStateChange: expect.any(Boolean),
    })
    expect(results.rows[0]).not.toHaveProperty('secret')
    expect(results.rows[0]).not.toHaveProperty('samples')
  })

  it('reports natural ordering as an absent sort key', async () => {
    const results = await query.getInterfaceResults(base)
    expect(results.sortKey).toBeNull()
    expect(results.sortDirection).toBe('desc')
    expect(results.rows.map((row) => row.id)).toEqual(['i1', 'i2'])
  })

  it('ranks the CRC view by windowed total and exposes it per row', async () => {
    const results = await query.getInterfaceResults({
      ...base,
      view: 'crc',
      sort: { kind: 'crc-window', direction: 'desc' },
    })
    expect(results.sortKey).toBe('crcWindowTotal')
    expect(results.rows.map((row) => row.id)).toEqual(['i2', 'i1'])
    expect(results.rows.map((row) => row.crcWindowTotal)).toEqual(['5', '2'])
  })

  it('authorizes once when the CRC result cache needs window totals', async () => {
    await query.getInterfaceResults({
      ...base,
      view: 'crc',
      sort: { kind: 'crc-window', direction: 'desc' },
    })

    expect(requireSession).toHaveBeenCalledTimes(1)
  })

  it('makes preloaded CRC totals an explicit result-cache input', async () => {
    const preloaded = {
      trend: [],
      totals: [{ interfaceId: 'i1', total: '9' }],
    }

    await query.getInterfaceResults(
      {
        ...base,
        view: 'crc',
        sort: { kind: 'crc-window', direction: 'desc' },
      },
      preloaded,
    )

    const resultsCache = cacheCalls.find((call) => call.key[1] === 'results')
    expect(resultsCache?.invocationArgs).toEqual([[preloaded.totals]])
  })

  it('honours an ascending CRC window sort', async () => {
    const results = await query.getInterfaceResults({
      ...base,
      view: 'crc',
      sort: { kind: 'crc-window', direction: 'asc' },
    })
    expect(results.rows.map((row) => row.id)).toEqual(['i1', 'i2'])
    expect(results.sortDirection).toBe('asc')
  })

  it('sorts by a counter column when one is selected', async () => {
    const results = await query.getInterfaceResults({
      ...base,
      sort: { kind: 'counter', sort: { key: 'rxCrcErrors', direction: 'desc', mode: 'delta' } },
    })
    expect(results.sortKey).toBe('rxCrcErrors')
    expect(results.rows.map((row) => row.id)).toEqual(['i2', 'i1'])
  })

  it('pages the sorted rows and keeps the unpaged total', async () => {
    const results = await query.getInterfaceResults({ ...base, pageSize: 10, page: 2 })
    expect(results.total).toBe(2)
    expect(results.page).toBe(2)
    expect(results.rows.map((row) => row.id)).toEqual([])

    const all = await query.getInterfaceResults({ ...base, pageSize: 'all' })
    expect(all.rows).toHaveLength(2)
  })

  it('keys the result cache by every filter that changes the row set', async () => {
    await query.getInterfaceResults({
      ...base,
      view: 'state-changed',
      window: '30d',
      query: 'eth',
      nodes: ['leaf-1', 'leaf-2'],
      counterMode: 'current',
    })
    expect(cacheCalls.at(-1)?.key).toEqual([
      'interface-health',
      'results',
      'h1',
      'state-changed',
      '30d',
      'eth',
      '["leaf-1","leaf-2"]',
      'natural::desc:current',
    ])
    expect(cacheCalls.at(-1)?.options.tags).toEqual(['interfaces:all', 'interfaces:host:h1'])
  })
})

describe('getInterfaceExport', () => {
  it('returns an exact purpose DTO selected from Prisma', async () => {
    const result = await query.getInterfaceExport({
      hostId: 'h1',
      from: null,
      to: null,
      nodes: [],
    })

    expect(result?.samples).toHaveLength(1)
    expect(Object.keys(result!.samples[0]).sort()).toEqual(
      [
        'adminSt',
        'dRxAlignErrors',
        'dRxBytes',
        'dRxCrcErrors',
        'dRxDiscards',
        'dRxErrors',
        'dTxBytes',
        'dTxDiscards',
        'dTxErrors',
        'interface',
        'operSpeed',
        'operSt',
        'rxAlignErrors',
        'rxBytes',
        'rxCrcErrors',
        'rxDiscards',
        'rxErrors',
        'rxPkts',
        'sampledAt',
        'txBytes',
        'txDiscards',
        'txErrors',
        'txPkts',
      ].sort(),
    )
    expect(Object.keys(result!.samples[0].interface).sort()).toEqual(
      ['description', 'dn', 'ifName', 'node', 'usage'].sort(),
    )

    const call = interfaceSampleFindMany.mock.calls.at(-1)?.[0]
    expect(call).toHaveProperty('select')
    expect(call).not.toHaveProperty('include')
  })
})
