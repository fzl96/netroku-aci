import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
import * as React from 'react'

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
      pcTag: '',
      preferredGroup: false,
      isolation: false,
      domains: [],
      providedContracts: [],
      consumedContracts: [],
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
