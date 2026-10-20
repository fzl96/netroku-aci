import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import * as React from 'react'
import { bdFixture } from '../../../tests/fixtures/bd'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})
const hostFindMany = mock(async () => [{ id: 'h1', name: 'Fabric', host: 'apic.local' }])
const hostFindFirst = mock(async () => ({
  id: 'h1',
  name: 'Fabric',
  host: 'apic.local',
  lastEpgSyncAt: new Date('2026-01-01T00:00:00Z'),
}))
const epgCount = mock(async () => 2)
const epgFindMany = mock(async (args: Record<string, unknown>) => {
  if ('distinct' in args) return []
  return [
    {
      id: 'e1',
      apicHostId: 'h1',
      dn: 'dn',
      name: 'web',
      tenant: 'T1',
      appProfile: 'App',
      description: '',
      bridgeDomain: 'BD',
      bdRelation: null as { bd: ReturnType<typeof bdFixture> } | null,
      pcTag: '',
      preferredGroup: false,
      isolation: false,
      domains: [],
      providedContracts: ['Contract10', 'Contract2'],
      consumedContracts: ['Contract2', 'Contract1', ''],
      internalSecret: 'omit-me',
      bindings: [
        {
          id: 'binding-1',
          apicHostId: 'h1',
          epgId: 'e1',
          dn: 'binding-dn',
          pathTDn: 'path',
          pod: '1',
          node: '101',
          port: 'Eth1/1',
          pathType: 'port',
          encap: 'vlan-1',
          mode: 'trunk',
          internalSecret: 'omit-binding',
        },
      ],
    },
  ]
})
const bindingFindMany = mock(async (): Promise<Array<Record<string, unknown>>> => [])
const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({
  AuthenticationRequiredError,
  requireSession,
  requireAdmin: async () => ({ id: 'admin', userName: 'admin' }),
}))
mock.module('@/lib/prisma', () => ({
  prisma: {
    apicHost: { findMany: hostFindMany, findFirst: hostFindFirst },
    epgSnapshot: { count: epgCount, findMany: epgFindMany },
    epgPathBinding: { findMany: bindingFindMany },
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
mock.module('react', () => ({ ...React, cache: (fn: unknown) => fn }))

// Restore the real query export after this suite: mock.module() would replace it
// process-wide and make the APIC-host query tests exercise this fixture instead.
const apicHostsQuery = await import('@/lib/apic-hosts/query')
const cachedHosts = spyOn(apicHostsQuery, 'getApicHosts').mockResolvedValue([
  {
    id: 'h1',
    name: 'Fabric',
    host: 'apic.local',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
])
afterAll(() => cachedHosts.mockRestore())

const query = await import('./query')
const base = {
  hostId: 'h1',
  view: 'epg' as const,
  query: '',
  page: 1,
  pageSize: 50 as const,
  tenants: [],
  appProfiles: [],
  contracts: [],
  nodes: [],
}

beforeEach(() => {
  authenticationError = null
  requireSession.mockClear()
  cachedHosts.mockClear()
  hostFindMany.mockClear()
  hostFindFirst.mockClear()
  epgCount.mockClear()
  epgFindMany.mockClear()
  bindingFindMany.mockClear()
  cacheCalls.length = 0
})

describe('EPG data interface', () => {
  it('reads the linked BD when available and retains the observed name for unlinked EPGs', async () => {
    const rows = await epgFindMany({})
    epgFindMany.mockResolvedValueOnce([
      { ...rows[0], bdRelation: { bd: bdFixture({ name: 'Resolved BD' }) } },
    ])
    const linked = await query.getEpgResults(base)
    expect(linked.view === 'epg' && linked.rows[0].bridgeDomain).toBe('Resolved BD')
    expect(linked.view === 'epg' && linked.rows[0].bridgeDomainDetails).toEqual({
      dn: 'uni/tn-common/BD-web',
      name: 'Resolved BD',
      tenant: 'common',
      description: 'Web network',
      vrf: 'VRF',
      subnets: ['10.0.0.1/24', '2001:db8::1/64'],
    })
    const unlinked = await query.getEpgResults(base)
    expect(unlinked.view === 'epg' && unlinked.rows[0].bridgeDomain).toBe('BD')
    expect(unlinked.view === 'epg' && unlinked.rows[0].bridgeDomainDetails).toBeNull()
  })
  it('authorizes before host resolution and returns safe purpose-owned hosts', async () => {
    expect(await query.resolveEpgHost('h1')).toEqual({
      kind: 'selected',
      host: { id: 'h1', name: 'Fabric', host: 'apic.local' },
      hosts: [{ id: 'h1', name: 'Fabric', host: 'apic.local' }],
    })
    expect(cachedHosts).toHaveBeenCalledTimes(1)
    expect(hostFindMany).not.toHaveBeenCalled()
  })

  it('maps cached host authorization failures to an EPG read error', async () => {
    cachedHosts.mockRejectedValueOnce(new apicHostsQuery.ApicHostReadError('unauthorized'))
    await expect(query.resolveEpgHost('h1')).rejects.toBeInstanceOf(query.EpgReadError)
  })

  it('maps only missing-session errors and propagates auth infrastructure failures', async () => {
    authenticationError = new AuthenticationRequiredError('missing')
    await expect(query.getEpgOverview('h1', base)).rejects.toBeInstanceOf(query.EpgReadError)

    authenticationError = new Error('session database unavailable')
    await expect(query.getEpgOverview('h1', base)).rejects.toThrow('session database unavailable')
    await expect(query.getEpgExportData({ hostId: 'h1', scope: 'all' })).rejects.toThrow(
      'session database unavailable',
    )
  })

  it('maps a missing session to the safe export variant', async () => {
    authenticationError = new AuthenticationRequiredError('missing')
    await expect(query.getEpgExportData({ hostId: 'h1', scope: 'all' })).resolves.toEqual({
      kind: 'unauthorized',
    })
  })

  it('tags persistent reads for eight hours', async () => {
    await query.getEpgOverview('h1', base)
    await query.getEpgResults(base)
    expect(cacheCalls.every((call) => call.options.revalidate === 28800)).toBe(true)
    expect(
      cacheCalls.every((call) => call.options.tags.join('|') === 'epgs:all|epgs:host:h1'),
    ).toBe(true)
  })

  it('uses unambiguous JSON array cache keys', async () => {
    await query.getEpgResults({ ...base, tenants: ['a,b'] })
    await query.getEpgResults({ ...base, tenants: ['a', 'b'] })
    expect(cacheCalls.at(-2)?.key).not.toEqual(cacheCalls.at(-1)?.key)
  })

  it('offers distinct naturally sorted contract names from both roles for the selected host', async () => {
    const result = await query.getEpgOverview('h1', { ...base, tenants: ['OtherTenant'] })
    expect(result.choices.contracts).toEqual(['Contract1', 'Contract2', 'Contract10'])
    expect(epgFindMany).toHaveBeenCalledWith({
      where: { apicHostId: 'h1' },
      select: { providedContracts: true, consumedContracts: true },
    })
  })

  it('uses normalized contracts for overview counts, both views, exports and cache keys', async () => {
    const params = { ...base, contracts: [' Contract2 ', 'Contract1', 'Contract2', ''] }
    const expected = {
      AND: [
        {
          OR: [
            { providedContracts: { hasSome: ['Contract1', 'Contract2'] } },
            { consumedContracts: { hasSome: ['Contract1', 'Contract2'] } },
          ],
        },
      ],
    }
    await query.getEpgOverview('h1', params)
    expect(epgCount).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining(expected) }),
    )
    await query.getEpgResults(params)
    expect(epgFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ where: expected })
    await query.getEpgResults({ ...params, view: 'port' })
    expect(bindingFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ epg: expect.objectContaining(expected) }),
      }),
    )
    await query.getEpgExportData({
      hostId: 'h1',
      scope: 'filtered',
      filters: { contract: params.contracts },
    })
    expect(epgFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ where: expected })
    expect(cacheCalls.every(({ key }) => key.includes('["Contract1","Contract2"]'))).toBe(true)

    await query.getEpgResults({ ...base, contracts: ['Contract1', 'Contract2'] })
    const canonicalKey = cacheCalls.at(-1)?.key
    await query.getEpgResults(params)
    expect(cacheCalls.at(-1)?.key).toEqual(canonicalKey)
    await query.getEpgResults({ ...base, contracts: ['Contract1'] })
    expect(cacheCalls.at(-1)?.key).not.toEqual(canonicalKey)

    await query.getEpgExportData({
      hostId: 'h1',
      scope: 'all',
      filters: { contract: ['Contract1'] },
    })
    expect(epgFindMany.mock.calls.at(-1)?.[0]).toMatchObject({ where: { apicHostId: 'h1' } })
    expect(epgFindMany.mock.calls.at(-1)?.[0]).not.toHaveProperty('where.AND')
  })

  it('groups all matching bindings before port pagination', async () => {
    bindingFindMany.mockImplementationOnce(async () => [
      {
        id: 'b1',
        apicHostId: 'h1',
        epgId: 'e1',
        dn: 'd',
        pathTDn: 'p',
        pod: '1',
        node: '101',
        port: 'Eth1/1',
        pathType: 'port',
        encap: 'vlan-1',
        mode: 'trunk',
        internalSecret: 'omit-binding',
        epg: { name: 'web', tenant: 'T1', appProfile: 'App', dn: 'dn', internalSecret: 'omit-epg' },
      },
      {
        id: 'b2',
        apicHostId: 'h1',
        epgId: 'e2',
        dn: 'd2',
        pathTDn: 'p',
        pod: '1',
        node: '101',
        port: 'Eth1/1',
        pathType: 'port',
        encap: 'vlan-2',
        mode: 'trunk',
        epg: { name: 'api', tenant: 'T1', appProfile: 'App', dn: 'dn2' },
      },
    ])
    const result = await query.getEpgResults({ ...base, view: 'port', pageSize: 10 })
    expect(result.view).toBe('port')
    expect(result.pagination.total).toBe(1)
    expect(bindingFindMany).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(result)).not.toContain('omit-')
  })

  it('maps stored EPG and binding records to explicit safe DTOs', async () => {
    const result = await query.getEpgResults(base)
    expect(result.view).toBe('epg')
    expect(JSON.stringify(result)).not.toContain('internalSecret')
    if (result.view === 'epg') {
      expect(Object.keys(result.rows[0]).sort()).toEqual([
        'apicHostId',
        'appProfile',
        'bindings',
        'bridgeDomain',
        'bridgeDomainDetails',
        'consumedContracts',
        'description',
        'dn',
        'domains',
        'id',
        'isolation',
        'name',
        'pcTag',
        'preferredGroup',
        'providedContracts',
        'tenant',
      ])
      expect(Object.keys(result.rows[0].bindings[0]).sort()).toEqual([
        'apicHostId',
        'dn',
        'encap',
        'epgId',
        'id',
        'mode',
        'node',
        'pathTDn',
        'pathType',
        'pod',
        'port',
      ])
    }
  })

  it('stores and returns only safe DTOs for exports', async () => {
    const result = await query.getEpgExportData({ hostId: 'h1', scope: 'all' })

    expect(result.kind).toBe('ready')
    expect(JSON.stringify(result)).not.toContain('internalSecret')
    if (result.kind === 'ready') {
      expect(Object.keys(result.rows[0]).sort()).toEqual([
        'apicHostId',
        'appProfile',
        'bindings',
        'bridgeDomain',
        'bridgeDomainDetails',
        'consumedContracts',
        'description',
        'dn',
        'domains',
        'id',
        'isolation',
        'name',
        'pcTag',
        'preferredGroup',
        'providedContracts',
        'tenant',
      ])
      expect(Object.keys(result.rows[0].bindings[0]).sort()).toEqual([
        'apicHostId',
        'dn',
        'encap',
        'epgId',
        'id',
        'mode',
        'node',
        'pathTDn',
        'pathType',
        'pod',
        'port',
      ])
    }
  })
})

describe('global search selection', () => {
  it('uses the stable DN plus APIC, rather than a replaced snapshot ID', async () => {
    await query.getEpgResults({ ...base, selected: 'uni/tn-A/ap-B/epg-C' })
    const call = epgFindMany.mock.calls.at(-1)?.[0] as { where: { dn: string; apicHostId: string } }
    expect(call.where.dn).toBe('uni/tn-A/ap-B/epg-C')
    expect(call.where.apicHostId).toBe('h1')
    const firstKey = cacheCalls.at(-1)?.key
    await query.getEpgResults({ ...base, selected: 'uni/tn-A/ap-B/epg-D' })
    expect(cacheCalls.at(-1)?.key).not.toEqual(firstKey)
  })
})
