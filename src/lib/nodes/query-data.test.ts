import { beforeEach, describe, expect, it, mock } from 'bun:test'
import * as React from 'react'
import type { NodePageParams } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', userName: 'alice' }
})
const hosts = [{ id: 'h1', name: 'Fabric', host: 'apic.local' }]
const apicHostFindMany = mock(async () => hosts)
const apicHostFindFirst = mock(async () => ({ lastNodeSyncAt: new Date('2026-01-01T00:00:00Z') }))
const nodeCount = mock(async (args: { where?: { OR?: unknown } }) => args.where?.OR ? 2 : 3)
const hardwareCount = mock(async () => 1)
type StoredNodeFixture = {
  id: string; nodeId: string; name: string; role: string; model: string
  version: string | null; fabricSt: string; state: string | null; uptime: string | null
  secret: string
}
const nodeFindMany = mock(async (): Promise<StoredNodeFixture[]> => [{
  id: 'n1', nodeId: '101', name: 'leaf-101', role: 'leaf', model: 'N9K',
  version: '1.0', fabricSt: 'active', state: null, uptime: '1d', secret: 'omit-node',
}])
const hardwareFindMany = mock(async () => [{
  id: 'c1', nodeId: '101', type: 'fan', name: 'Fan 1', operSt: 'ok',
  healthy: true, model: 'FAN', secret: 'omit-component',
}])
const hardwareGroupBy = mock(async () => [
  { nodeId: '101', type: 'psu', healthy: true, _count: { _all: 2 } },
  { nodeId: '101', type: 'fan', healthy: false, _count: { _all: 1 } },
])
const sampleFindMany = mock(async () => [{
  sampledAt: new Date('2026-01-02T00:00:00Z'), nodesOnline: 2,
  componentsFailed: 1, secret: 'omit-sample',
}])
const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({ prisma: {
  apicHost: { findMany: apicHostFindMany, findFirst: apicHostFindFirst },
  nodeSnapshot: { count: nodeCount, findMany: nodeFindMany },
  hardwareComponent: { count: hardwareCount, findMany: hardwareFindMany, groupBy: hardwareGroupBy },
  nodeStatusSample: { findMany: sampleFindMany },
} }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown, key: string[], options: { tags: string[]; revalidate: number }) => {
    cacheCalls.push({ key, options }); return fn
  },
  revalidateTag: () => {},
}))
mock.module('react', () => ({ ...React, cache: (fn: unknown) => fn }))

const query = await import('./query')
const base: NodePageParams = {
  hostId: 'h1', query: '', view: 'nodes', role: null, componentType: null,
  page: 1, pageSize: 50,
}

beforeEach(() => {
  authenticationError = null; cacheCalls.length = 0
  for (const fn of [requireSession, apicHostFindMany, apicHostFindFirst, nodeCount, hardwareCount, nodeFindMany, hardwareFindMany, hardwareGroupBy, sampleFindMany]) fn.mockClear()
})

describe('node data interface', () => {
  it('authorizes host resolution and returns safe purpose hosts', async () => {
    await expect(query.resolveNodeHost('h1')).resolves.toEqual({ kind: 'selected', host: hosts[0], hosts })
    expect(requireSession).toHaveBeenCalledTimes(1)
  })

  it('maps only missing sessions and propagates authentication infrastructure failures', async () => {
    authenticationError = new AuthenticationRequiredError()
    await expect(query.getNodeOverview('h1')).rejects.toBeInstanceOf(query.NodeReadError)
    authenticationError = new Error('session database unavailable')
    await expect(query.getNodeOverview('h1')).rejects.toThrow('session database unavailable')
  })

  it('tags every persistent read for eight hours', async () => {
    await query.getNodeOverview('h1'); await query.getNodeTrend('h1'); await query.getNodeResults(base)
    expect(cacheCalls.every(call => call.options.revalidate === 28_800)).toBe(true)
    expect(cacheCalls.every(call => call.options.tags.join('|') === 'nodes:all|nodes:host:h1')).toBe(true)
  })

  it('serializes overview and trend values inside the cache producer', async () => {
    expect(await query.getNodeOverview('h1')).toEqual({
      lastNodeSyncAt: '2026-01-01T00:00:00.000Z', nodesOnline: 2, nodesTotal: 3, componentsFailed: 1,
    })
    expect(await query.getNodeTrend('h1')).toEqual([{ sampledAt: '2026-01-02T00:00:00.000Z', nodesOnline: 2, componentsFailed: 1 }])
  })

  it('returns explicit node DTOs, globally sorted before pagination', async () => {
    nodeFindMany.mockImplementationOnce(async () => [
      { id: 'n2', nodeId: '10', name: '', role: 'leaf', model: '', version: null, fabricSt: 'active', state: null, uptime: null, secret: 'omit' },
      { id: 'n1', nodeId: '2', name: '', role: 'leaf', model: '', version: null, fabricSt: 'active', state: null, uptime: null, secret: 'omit' },
    ])
    const result = await query.getNodeResults({ ...base, pageSize: 10 })
    expect(result.view).toBe('nodes')
    expect(result.rows.map((row: { nodeId: string }) => row.nodeId)).toEqual(['2', '10'])
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(nodeFindMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.any(Object) }))
  })

  it('returns explicit component DTOs', async () => {
    const result = await query.getNodeResults({ ...base, view: 'components', componentType: 'fan' })
    expect(result).toEqual(expect.objectContaining({ view: 'components', rows: [{
      id: 'c1', nodeId: '101', type: 'fan', name: 'Fan 1', operSt: 'ok', healthy: true, model: 'FAN',
    }] }))
    expect(JSON.stringify(result)).not.toContain('secret')
  })
})
