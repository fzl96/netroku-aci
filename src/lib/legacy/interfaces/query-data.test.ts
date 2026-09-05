import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { LegacyInterfaceListState } from './params'
import type { LegacyLatestSampleRow } from './latest-sample-query'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})

const sample = {
  id: 's1',
  collectedAt: new Date('2026-01-02T00:00:00Z'),
  adminSt: 'up',
  operSt: 'down',
  speed: '1000',
  inputErrors: BigInt(10),
  outputErrors: BigInt(2),
  crcErrors: BigInt(7),
  dInputErrors: BigInt(1),
  dOutputErrors: null,
  dCrcErrors: BigInt(4),
}

const storedSnapshot = {
  id: 'i1',
  deviceId: 'd1',
  ifName: 'Gi1/0/1',
  description: 'uplink',
  ipAddress: '10.0.0.1',
  prefixLength: 24,
  mtu: 1500,
  speed: '1000',
  adminSt: 'up',
  operSt: 'down',
  present: true,
  firstSeenAt: new Date('2026-01-01T00:00:00Z'),
  lastSeenAt: new Date('2026-01-02T00:00:00Z'),
  device: { id: 'd1', hostname: 'edge-1', site: 'hq', managementIp: '10.0.0.254' },
  samples: [sample],
  secret: 'omit-snapshot',
}

const snapshotSelectCalls: unknown[] = []

let findManyError: unknown = null
let snapshotMissing = false
const snapshotWhereCalls: unknown[] = []
let extraSnapshots = 0
const snapshotFindMany = mock(async (args: { where?: unknown; select?: unknown }) => {
  if (findManyError) throw findManyError
  snapshotWhereCalls.push(args.where)
  snapshotSelectCalls.push(args.select)
  return [
    storedSnapshot,
    { ...storedSnapshot, id: 'i2', ifName: 'Gi1/0/2', samples: [] },
    ...Array.from({ length: extraSnapshots }, (_, index) => ({
      ...storedSnapshot,
      id: `x${index}`,
      hostname: 'edge-1',
      ifName: `Gi2/0/${index}`,
    })),
  ]
})
const snapshotCount = mock(async (args?: { where?: { present?: boolean } }) => {
  if (args?.where?.present === false) return 3
  if (args?.where) return 2
  return 9
})
const snapshotFindUnique = mock(async () => (snapshotMissing ? null : storedSnapshot))
const sampleFindMany = mock(async () => {
  if (findManyError) throw findManyError
  return [sample]
})
type CrcGroupByArgs = {
  by: string[]
  where: { collectedAt: { gte: Date }; dCrcErrors: unknown }
  _sum: unknown
}
const sampleGroupBy = mock(async (_args: CrcGroupByArgs) => {
  if (findManyError) throw findManyError
  // The CRC window totals are summed in the database, not row by row.
  return [{ interfaceId: 'i1', _sum: { dCrcErrors: BigInt(4) } }]
})
const sampleCount = mock(async () => 5)
const deviceFindMany = mock(async () => [
  { id: 'd1', hostname: 'edge-1', site: 'hq' },
  { id: 'd2', hostname: 'edge-2', site: 'dc1' },
])
const latestSampleRow = {
  interfaceId: 'i1',
  collectedAt: sample.collectedAt,
  inputErrors: sample.inputErrors,
  outputErrors: sample.outputErrors,
  crcErrors: sample.crcErrors,
  dInputErrors: sample.dInputErrors,
  dOutputErrors: sample.dOutputErrors,
  dCrcErrors: sample.dCrcErrors,
}
// Two raw reads share the client: the newest sample per interface, and the
// state-change id scan. They are told apart by the SQL they carry.
let latestSampleRows: LegacyLatestSampleRow[] = [latestSampleRow]
const queryRaw = mock(async (query: { strings: string[]; values: unknown[] }) => {
  if (findManyError) throw findManyError
  return query.strings.join('?').includes('UNNEST')
    ? latestSampleRows.filter((row) => (query.values[0] as string[]).includes(row.interfaceId))
    : [{ interfaceId: 'i1' }]
})

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({
  prisma: {
    legacyInterfaceSnapshot: {
      findMany: snapshotFindMany,
      count: snapshotCount,
      findUnique: snapshotFindUnique,
    },
    legacyInterfaceSample: {
      findMany: sampleFindMany,
      count: sampleCount,
      groupBy: sampleGroupBy,
    },
    legacyDevice: { findMany: deviceFindMany },
    $queryRaw: queryRaw,
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

const base: LegacyInterfaceListState = {
  query: '',
  deviceIds: [],
  view: 'all',
  mode: 'delta',
  window: '7d',
  sortKey: 'hostname',
  sortDirection: 'asc',
  page: 1,
  pageSize: 50,
}

beforeEach(() => {
  authenticationError = null
  findManyError = null
  snapshotMissing = false
  extraSnapshots = 0
  latestSampleRows = [latestSampleRow]
  queryRaw.mockClear()
  snapshotWhereCalls.length = 0
  snapshotSelectCalls.length = 0
  cacheCalls.length = 0
})

describe('legacy interface authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getLegacyInterfaceResults(base)).rejects.toBeInstanceOf(
      query.LegacyInterfaceReadError,
    )
    await expect(query.getLegacyInterfaceHistory('i1', { range: '24h' })).rejects.toBeInstanceOf(
      query.LegacyInterfaceReadError,
    )
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getLegacyInterfaceSummary()).rejects.toThrow('database on fire')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getLegacyInterfaceResults(base).catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getLegacyInterfaceResults', () => {
  it('flattens the device relation and the latest sample into a safe row shape', async () => {
    const results = await query.getLegacyInterfaceResults(base)
    expect(results.rows[0]).toEqual({
      id: 'i1',
      hostname: 'edge-1',
      site: 'hq',
      ifName: 'Gi1/0/1',
      description: 'uplink',
      ipAddress: '10.0.0.1',
      prefixLength: 24,
      speed: '1000',
      adminSt: 'up',
      operSt: 'down',
      crcWindowTotal: null,
      sample: {
        collectedAt: '2026-01-02T00:00:00.000Z',
        inputErrors: '10',
        outputErrors: '2',
        crcErrors: '7',
        dInputErrors: '1',
        dOutputErrors: null,
        dCrcErrors: '4',
      },
    })
    expect(results.rows[0]).not.toHaveProperty('secret')
    expect(results.rows[0]).not.toHaveProperty('device')
    expect(results.rows[0]).not.toHaveProperty('samples')
  })

  it('reads only the columns the table renders and sorts on', async () => {
    await query.getLegacyInterfaceResults(base)
    const select = snapshotSelectCalls.at(-1) as Record<string, unknown>
    // Detail-only facts stay on the detail page's read.
    for (const column of ['mtu', 'present', 'firstSeenAt', 'lastSeenAt', 'deviceId']) {
      expect(select).not.toHaveProperty(column)
    }
    expect(select.device).toEqual({ select: { hostname: true, site: true } })
    // Counters arrive from the lateral seek, not a relation load.
    expect(select).not.toHaveProperty('samples')
  })

  it('reads the newest sample through one lateral seek per matched interface', async () => {
    await query.getLegacyInterfaceResults(base)
    const seek = queryRaw.mock.calls
      .map(([sql]) => sql.strings.join('?'))
      .find((text) => text.includes('UNNEST'))
    expect(seek).toContain('JOIN LATERAL')
    expect(seek).toContain('LIMIT 1')
  })

  it('does not cache the matched row set, which outgrows the data cache', async () => {
    await query.getLegacyInterfaceResults(base)
    expect(cacheCalls.map((call) => call.key[1])).not.toContain('rows')
  })

  it('keeps a snapshot without samples as a row with no sample', async () => {
    const results = await query.getLegacyInterfaceResults(base)
    expect(results.rows).toHaveLength(2)
    expect(results.rows[1].sample).toBeNull()
  })

  it('pages the sorted rows and reports the unpaged total', async () => {
    extraSnapshots = 10
    const results = await query.getLegacyInterfaceResults({ ...base, page: 2, pageSize: 10 })
    expect(results.rows).toHaveLength(2)
    expect(results.total).toBe(12)
    expect(results.page).toBe(2)
    expect(results.pageSize).toBe(10)
  })

  it.each([
    'hostname',
    'ifName',
    'description',
    'ipAddress',
    'speed',
    'adminSt',
    'operSt',
  ] as const)('fetches only the visible samples when sorting by %s', async (sortKey) => {
    extraSnapshots = 120
    const results = await query.getLegacyInterfaceResults({ ...base, sortKey, page: 2 })
    expect(results.total).toBe(122)
    expect(results.rows).toHaveLength(50)
    expect(queryRaw).toHaveBeenCalledTimes(1)
    expect(queryRaw.mock.calls[0][0].values[0]).toEqual(results.rows.map((row) => row.id))
    expect(results.rows[0].ifName).toBe('Gi2/0/48')
  })

  it('skips sample reads for an empty page', async () => {
    const results = await query.getLegacyInterfaceResults({ ...base, page: 2 })
    expect(results.rows).toEqual([])
    expect(results.total).toBe(2)
    expect(queryRaw).not.toHaveBeenCalled()
  })

  it.each(['inputErrors', 'outputErrors', 'crcErrors', 'collectedAt'] as const)(
    'sorts globally before paging by %s',
    async (sortKey) => {
      extraSnapshots = 120
      latestSampleRows = [
        latestSampleRow,
        {
          ...latestSampleRow,
          interfaceId: 'x119',
          collectedAt: new Date('2026-02-01T00:00:00Z'),
          inputErrors: BigInt('9007199254740993'),
          outputErrors: BigInt('9007199254740993'),
          crcErrors: BigInt('9007199254740993'),
          dInputErrors: BigInt('9007199254740993'),
          dOutputErrors: BigInt('9007199254740993'),
          dCrcErrors: BigInt('9007199254740993'),
        },
      ]
      for (const mode of ['current', 'delta'] as const) {
        queryRaw.mockClear()
        const results = await query.getLegacyInterfaceResults({
          ...base,
          sortKey,
          mode,
          sortDirection: 'desc',
        })
        expect(results.rows[0].id).toBe('x119')
        expect(results.rows[0].sample?.inputErrors).toBe('9007199254740993')
        expect(results.total).toBe(122)
        expect(queryRaw).toHaveBeenCalledTimes(1)
        expect(queryRaw.mock.calls[0][0].values[0]).toHaveLength(122)
      }
    },
  )

  it('pages CRC window totals before fetching latest samples', async () => {
    extraSnapshots = 120
    const results = await query.getLegacyInterfaceResults({
      ...base,
      view: 'crc',
      sortKey: 'crcErrors',
      sortDirection: 'desc',
    })
    expect(results.rows[0].id).toBe('i1')
    expect(results.rows[0].crcWindowTotal).toBe('4')
    expect(results.rows[0].sample?.crcErrors).toBe('7')
    expect(queryRaw.mock.calls[0][0].values[0]).toEqual(results.rows.map((row) => row.id))
  })

  it('restricts the crc view to interfaces whose window total increased', async () => {
    const results = await query.getLegacyInterfaceResults({ ...base, view: 'crc' })
    expect(sampleGroupBy).toHaveBeenCalled()
    expect(snapshotWhereCalls.at(-1)).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: ['i1'] } }]),
    })
    expect(results.rows.find((row) => row.id === 'i1')?.crcWindowTotal).toBe('4')
  })

  it('sums the crc window in the database, restricted to positive deltas', async () => {
    await query.getLegacyInterfaceResults({ ...base, view: 'crc', window: '30d' })
    const args = sampleGroupBy.mock.calls.at(-1)![0]
    expect(args.by).toEqual(['interfaceId'])
    expect(args.where.dCrcErrors).toEqual({ gt: BigInt(0) })
    expect(args._sum).toEqual({ dCrcErrors: true })
  })

  it('restricts the state-changed view to the ids the raw query reports', async () => {
    await query.getLegacyInterfaceResults({ ...base, view: 'state-changed' })
    expect(queryRaw).toHaveBeenCalled()
    expect(snapshotWhereCalls.at(-1)).toMatchObject({
      AND: expect.arrayContaining([{ id: { in: ['i1'] } }]),
    })
  })
})

describe('getLegacyInterfaceSummary', () => {
  it('counts the interface lifecycle states', async () => {
    expect(await query.getLegacyInterfaceSummary()).toEqual({
      total: 9,
      down: 2,
      absent: 3,
      withHistory: 2,
    })
  })
})

describe('getLegacyInterfaceFilterOptions', () => {
  it('lists the devices that can be filtered on', async () => {
    expect(await query.getLegacyInterfaceFilterOptions()).toEqual({
      devices: [
        { id: 'd1', hostname: 'edge-1', site: 'hq' },
        { id: 'd2', hostname: 'edge-2', site: 'dc1' },
      ],
    })
  })
})

describe('getLegacyInterfaceHistory', () => {
  it('returns chart points oldest-first alongside the paged samples', async () => {
    const history = await query.getLegacyInterfaceHistory('i1', { range: '7d', page: 2 })
    expect(history?.snapshot.id).toBe('i1')
    expect(history?.snapshot.device).toEqual({
      id: 'd1',
      hostname: 'edge-1',
      site: 'hq',
      managementIp: '10.0.0.254',
    })
    expect(history?.snapshot).not.toHaveProperty('samples')
    expect(history?.range).toBe('7d')
    expect(history?.page).toBe(2)
    expect(history?.total).toBe(5)
    expect(history?.pageSize).toBe(25)
    expect(history?.samples[0].dCrcErrors).toBe('4')
  })

  it('clamps non-positive page numbers', async () => {
    expect((await query.getLegacyInterfaceHistory('i1', { range: '24h', page: 0 }))?.page).toBe(1)
  })

  it('reports a missing interface and a blank id as absent rather than throwing', async () => {
    snapshotMissing = true
    expect(await query.getLegacyInterfaceHistory('missing', { range: '24h' })).toBeNull()
    expect(await query.getLegacyInterfaceHistory('', { range: '24h' })).toBeNull()
  })
})
