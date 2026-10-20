import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { bdFixture } from '../../../tests/fixtures/bd'
import { parseBdPageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authError: Error | null = null
const authorize = mock(async () => {
  if (authError) throw authError
  return { id: 'u1', userName: 'operator' }
})
const findMany = mock(async (args: unknown) => {
  void args
  const { epgCount, ...row } = bdFixture()
  return [{ ...row, _count: { epgs: epgCount } }]
})
const count = mock(async (args: unknown) => {
  void args
  return 125
})
const findHost = mock(
  async (args: unknown): Promise<{ name: string; lastBdSyncAt: Date } | null> => {
    void args
    return { name: 'Fabric', lastBdSyncAt: new Date('2026-10-20T00:00:00Z') }
  },
)
const cacheTags: string[][] = []
mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession: authorize }))
mock.module('@/lib/prisma', () => ({
  prisma: { bdSnapshot: { findMany, count }, apicHost: { findUnique: findHost } },
}))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown, _keys: string[], options: { tags: string[] }) => {
    cacheTags.push(options.tags)
    return fn
  },
  revalidateTag: () => {},
}))
const query = await import('./query')
beforeEach(() => {
  authError = null
  findMany.mockClear()
  count.mockClear()
  findHost.mockClear()
  cacheTags.length = 0
})

describe('BD inventory reads', () => {
  it('restricts a linked BD destination to its exact DN and APIC host', async () => {
    const params = parseBdPageParams({ apic: 'h1', selected: 'uni/tn-common/BD-web' })
    expect(query.buildBdWhere(params.hostId, params)).toEqual({
      apicHostId: 'h1',
      dn: 'uni/tn-common/BD-web',
    })
    await query.getBdResults(params)
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { apicHostId: 'h1', dn: 'uni/tn-common/BD-web' } }),
    )
  })
  it('keeps tenant and routing filters host scoped and searches subnet/EPG text', () => {
    expect(
      query.buildBdWhere('h2', {
        query: ' 10.0.0 ',
        tenant: ['common'],
        vrf: ['VRF'],
        routing: 'no',
      }),
    ).toEqual({
      apicHostId: 'h2',
      OR: [
        { searchText: { contains: '10.0.0', mode: 'insensitive' } },
        {
          epgs: {
            some: {
              OR: ['name', 'tenant', 'appProfile', 'dn'].map((field) => ({
                [field]: { contains: '10.0.0', mode: 'insensitive' },
              })),
            },
          },
        },
      ],
      tenant: { in: ['common'] },
      vrf: { in: ['VRF'] },
      unicastRoute: false,
    })
  })
  it('clamps pagination and includes configuration and EPG relationship data', async () => {
    const result = await query.getBdResults(
      parseBdPageParams({ apic: 'h1', page: '999', pageSize: '50' }),
    )
    expect(result.pagination).toMatchObject({ page: 3, totalPages: 3, total: 125 })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { apicHostId: 'h1' }, skip: 100, take: 50 }),
    )
    expect(result.rows[0].epgs[0].tenant).toBe('T1')
    expect(cacheTags).toContainEqual(['bds:all', 'bds:host:h1'])
  })
  it('exports all matching records independently of page size and honors all versus filtered scope', async () => {
    const filters = {
      query: 'gateway',
      tenant: ['common'],
      routing: 'yes' as const,
      selected: 'uni/tn-common/BD-web',
    }
    await query.getBdExportData({ hostId: 'h1', scope: 'filtered', filters })
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: query.buildBdWhere('h1', filters) }),
    )
    expect(findMany.mock.calls.at(-1)?.[0]).not.toHaveProperty('take')
    await query.getBdExportData({ hostId: 'h1', scope: 'all', filters })
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { apicHostId: 'h1' } }),
    )
  })
  it('checks authentication before cached reads and exports', async () => {
    authError = new AuthenticationRequiredError()
    await expect(query.getBdResults(parseBdPageParams({ apic: 'h1' }))).rejects.toBeInstanceOf(
      query.BdReadError,
    )
    expect(await query.getBdExportData({ hostId: 'h1', scope: 'all' })).toEqual({
      kind: 'unauthorized',
    })
    expect(findMany).not.toHaveBeenCalled()
    expect(findHost).not.toHaveBeenCalled()
    expect(cacheTags).toHaveLength(0)
    authError = new Error('Session store unavailable')
    await expect(query.getBdExportData({ hostId: 'h1', scope: 'all' })).rejects.toThrow(
      'Session store unavailable',
    )
  })
})
