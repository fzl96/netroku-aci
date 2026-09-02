import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {} }))
mock.module('@/lib/prisma', () => ({ prisma: { apicHost: { findFirst: async () => null } } }))

const { createInterfaceMutation } = await import('./mutation')

class AuthenticationRequiredError extends Error {}

type AuditRecord = {
  userId?: string | null
  userName: string
  action: string
  target?: string | null
  status?: string
  detail?: string | null
}

function setup(overrides: {
  session?: () => Promise<{ id: string; userName: string }>
  host?: { id: string; name: string; host: string } | null
  resync?: () => Promise<{ synced: number; total: number }>
} = {}) {
  const audits: AuditRecord[] = []
  const tags: string[] = []
  const mutation = createInterfaceMutation({
    requireSession: overrides.session ?? (async () => ({ id: 'u1', userName: 'alice' })),
    findHost: async () => (
      overrides.host === undefined ? { id: 'h1', name: 'Fabric', host: 'apic.local' } : overrides.host
    ),
    resyncInterfaces: overrides.resync ?? (async () => ({ synced: 12, total: 40 })),
    recordAudit: async input => { audits.push(input as AuditRecord) },
    revalidateTag: tag => { tags.push(tag) },
    isAuthenticationRequiredError: error => error instanceof AuthenticationRequiredError,
  })
  return { mutation, audits, tags }
}

const credentials = { apicHostId: 'h1', username: ' admin ', password: 'secret' }

describe('resyncInterfaceInventory', () => {
  it('syncs, audits the acting user, and invalidates the host reads', async () => {
    const { mutation, audits, tags } = setup()

    expect(await mutation.resyncInterfaceInventory(credentials))
      .toEqual({ ok: true, synced: 12, total: 40 })
    expect(audits).toEqual([{
      userId: 'u1',
      userName: 'alice',
      action: 'resync.interfaces',
      target: 'Fabric (apic.local)',
      detail: 'synced 12 (total 40)',
    }])
    expect(tags).toEqual(['interfaces:all', 'interfaces:host:h1'])
  })

  it('trims the username before reaching APIC', async () => {
    const resync = mock(async () => ({ synced: 1, total: 1 }))
    const { mutation } = setup({ resync })
    await mutation.resyncInterfaceInventory(credentials)
    expect(resync).toHaveBeenCalledWith({
      apicHostId: 'h1', host: 'apic.local', username: 'admin', password: 'secret',
    })
  })

  it('reports an unauthenticated caller without touching the cache', async () => {
    const { mutation, audits, tags } = setup({
      session: async () => { throw new AuthenticationRequiredError('nope') },
    })
    expect(await mutation.resyncInterfaceInventory(credentials))
      .toEqual({ ok: false, code: 'unauthorized', error: 'Unauthorized' })
    expect(audits).toEqual([])
    expect(tags).toEqual([])
  })

  it('propagates unexpected session failures', async () => {
    const { mutation } = setup({
      session: async () => { throw new Error('database on fire') },
    })
    await expect(mutation.resyncInterfaceInventory(credentials)).rejects.toThrow('database on fire')
  })

  it('reports a missing host', async () => {
    const { mutation, tags } = setup({ host: null })
    expect(await mutation.resyncInterfaceInventory(credentials))
      .toEqual({ ok: false, code: 'host-not-found', error: 'Host not found' })
    expect(tags).toEqual([])
  })

  it('reports a failed sync without invalidating reads', async () => {
    const { mutation, tags } = setup({
      resync: async () => { throw new Error('APIC unreachable') },
    })
    expect(await mutation.resyncInterfaceInventory(credentials))
      .toEqual({ ok: false, code: 'sync-failed', error: 'Failed to resync interfaces' })
    expect(tags).toEqual([])
  })
})

describe('resyncInterfaceInventoryForScheduler', () => {
  const scheduled = {
    apicHostId: 'h1', hostName: 'Fabric', host: 'apic.local',
    username: 'admin', password: 'secret',
  }

  it('audits a successful scheduled run and invalidates the host reads', async () => {
    const { mutation, audits, tags } = setup()

    expect(await mutation.resyncInterfaceInventoryForScheduler(scheduled))
      .toEqual({ synced: 12, total: 40 })
    expect(audits).toEqual([{
      userId: null,
      userName: 'scheduler',
      action: 'resync.interfaces',
      target: 'Fabric (apic.local)',
      status: 'success',
      detail: 'synced 12 (total 40)',
    }])
    expect(tags).toEqual(['interfaces:all', 'interfaces:host:h1'])
  })

  it('audits a failed scheduled run and rethrows for the host runner', async () => {
    const { mutation, audits, tags } = setup({
      resync: async () => { throw new Error('APIC unreachable') },
    })

    await expect(mutation.resyncInterfaceInventoryForScheduler(scheduled))
      .rejects.toThrow('APIC unreachable')
    expect(audits).toEqual([{
      userId: null,
      userName: 'scheduler',
      action: 'resync.interfaces',
      target: 'Fabric (apic.local)',
      status: 'failure',
      detail: 'APIC unreachable',
    }])
    expect(tags).toEqual([])
  })
})

describe('invalidateInterfaceReads', () => {
  it('expires the shared and host-scoped dataset tags', () => {
    const { mutation, tags } = setup()
    mutation.invalidateInterfaceReads('h9')
    expect(tags).toEqual(['interfaces:all', 'interfaces:host:h9'])
  })
})
