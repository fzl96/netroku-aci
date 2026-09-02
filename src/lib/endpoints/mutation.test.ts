import { beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))

const { createEndpointMutation } = await import('./mutation')

class EndpointResyncInProgressError extends Error {}

let authenticated = true
let hostFound = true
let resyncError: unknown = null
const callOrder: string[] = []

const requireSession = mock(async () => {
  callOrder.push('auth')
  if (!authenticated) throw new Error('Unauthorized')
  return { id: 'user-1', role: 'member', userName: 'operator' }
})
const findFirst = mock(async () => {
  callOrder.push('host')
  return hostFound
    ? { id: 'host-1', name: 'APIC One', host: '192.0.2.1' }
    : null
})
const resyncEndpoints = mock(async () => {
  callOrder.push('sync')
  if (resyncError) throw resyncError
  return { synced: 4, total: 9 }
})
const recordAudit = mock(async () => {
  callOrder.push('audit')
})
const reportAuditError = mock(() => {})
const revalidateTag = mock((tag: string, profile: { expire: number }) => {
  void profile
  callOrder.push(`invalidate:${tag}`)
})

const {
  invalidateEndpointReads,
  resyncEndpointInventory,
  resyncEndpointInventoryForScheduler,
} = createEndpointMutation({
  requireSession,
  findHost: async id => {
    expect(id).toBeString()
    return findFirst()
  },
  resyncEndpoints,
  recordAudit,
  revalidateTag,
  isInProgressError: error => error instanceof EndpointResyncInProgressError,
  reportAuditError,
})

beforeEach(() => {
  authenticated = true
  hostFound = true
  resyncError = null
  callOrder.length = 0
  requireSession.mockClear()
  findFirst.mockClear()
  resyncEndpoints.mockClear()
  recordAudit.mockClear()
  reportAuditError.mockClear()
  revalidateTag.mockClear()
})

describe('resyncEndpointInventory', () => {
  it('rejects unauthenticated calls before host or APIC access', async () => {
    authenticated = false

    await expect(resyncEndpointInventory({
      apicHostId: 'host-1',
      username: ' operator ',
      password: 'secret',
    })).resolves.toEqual({
      ok: false,
      code: 'unauthorized',
      error: 'Unauthorized',
    })
    expect(callOrder).toEqual(['auth'])
  })

  it('returns host-not-found without calling APIC', async () => {
    hostFound = false

    await expect(resyncEndpointInventory({
      apicHostId: 'missing',
      username: 'operator',
      password: 'secret',
    })).resolves.toEqual({
      ok: false,
      code: 'host-not-found',
      error: 'Host not found',
    })
    expect(resyncEndpoints).not.toHaveBeenCalled()
  })

  it('syncs with the resolved host, audits, then invalidates both endpoint tags', async () => {
    await expect(resyncEndpointInventory({
      apicHostId: 'host-1',
      username: ' operator ',
      password: 'secret',
    })).resolves.toEqual({ ok: true, synced: 4, total: 9 })

    expect(findFirst).toHaveBeenCalledTimes(1)
    expect(resyncEndpoints).toHaveBeenCalledWith({
      apicHostId: 'host-1',
      host: '192.0.2.1',
      username: 'operator',
      password: 'secret',
    })
    expect(recordAudit).toHaveBeenCalledWith({
      userId: 'user-1',
      userName: 'operator',
      action: 'resync.endpoints',
      target: 'APIC One (192.0.2.1)',
      detail: 'synced 4 (total 9)',
    })
    expect(revalidateTag).toHaveBeenNthCalledWith(1, 'endpoints:all', { expire: 0 })
    expect(revalidateTag).toHaveBeenNthCalledWith(2, 'endpoints:host:host-1', { expire: 0 })
    expect(callOrder).toEqual([
      'auth',
      'host',
      'sync',
      'audit',
      'invalidate:endpoints:all',
      'invalidate:endpoints:host:host-1',
    ])
  })

  it('classifies concurrent and unknown failures without auditing or invalidating', async () => {
    resyncError = new EndpointResyncInProgressError('internal host details')
    await expect(resyncEndpointInventory({
      apicHostId: 'host-1',
      username: 'operator',
      password: 'secret',
    })).resolves.toEqual({
      ok: false,
      code: 'in-progress',
      error: 'Endpoint resync is already in progress',
    })

    resyncError = new Error('database host secret')
    await expect(resyncEndpointInventory({
      apicHostId: 'host-1',
      username: 'operator',
      password: 'secret',
    })).resolves.toEqual({
      ok: false,
      code: 'sync-failed',
      error: 'Failed to resync endpoints',
    })
    expect(recordAudit).not.toHaveBeenCalled()
    expect(revalidateTag).not.toHaveBeenCalled()
  })

  it('still invalidates and succeeds when audit persistence unexpectedly rejects', async () => {
    recordAudit.mockImplementationOnce(async () => {
      throw new Error('audit database unavailable')
    })

    await expect(resyncEndpointInventory({
      apicHostId: 'host-1',
      username: 'operator',
      password: 'secret',
    })).resolves.toEqual({ ok: true, synced: 4, total: 9 })

    expect(reportAuditError).toHaveBeenCalledTimes(1)
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })
})

describe('trusted scheduled resync', () => {
  it('uses the shared executor without interactive auth and records the scheduler actor', async () => {
    await expect(resyncEndpointInventoryForScheduler({
      apicHostId: 'host-1',
      hostName: 'APIC One',
      host: '192.0.2.1',
      username: 'scheduler-user',
      password: 'secret',
    })).resolves.toEqual({ synced: 4, total: 9 })

    expect(requireSession).not.toHaveBeenCalled()
    expect(findFirst).not.toHaveBeenCalled()
    expect(recordAudit).toHaveBeenCalledWith({
      userId: null,
      userName: 'scheduler',
      action: 'resync.endpoints',
      target: 'APIC One (192.0.2.1)',
      status: 'success',
      detail: 'synced 4 (total 9)',
    })
    expect(revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('audits scheduler failures, skips invalidation, and rethrows', async () => {
    resyncError = new Error('APIC unavailable')

    await expect(resyncEndpointInventoryForScheduler({
      apicHostId: 'host-1',
      hostName: 'APIC One',
      host: '192.0.2.1',
      username: 'scheduler-user',
      password: 'secret',
    })).rejects.toThrow('APIC unavailable')

    expect(recordAudit).toHaveBeenCalledWith({
      userId: null,
      userName: 'scheduler',
      action: 'resync.endpoints',
      target: 'APIC One (192.0.2.1)',
      status: 'failure',
      detail: 'APIC unavailable',
    })
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})

describe('invalidateEndpointReads', () => {
  it('expires the broad and host-specific tags immediately', () => {
    invalidateEndpointReads('host-7')
    expect(revalidateTag.mock.calls).toEqual([
      ['endpoints:all', { expire: 0 }],
      ['endpoints:host:host-7', { expire: 0 }],
    ])
  })
})
