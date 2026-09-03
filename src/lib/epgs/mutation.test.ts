import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }))

const { createEpgMutation } = await import('./mutation')

class AuthenticationRequiredError extends Error {}

function dependencies() {
  return {
    requireSession: mock(async () => ({ id: 'u1', userName: 'alice' })),
    findHost: mock(async () => ({ id: 'h1', name: 'Fabric', host: 'apic.local' })),
    resyncEpgs: mock(async () => ({ syncedEpgs: 3, syncedBindings: 5 })),
    recordAudit: mock(async () => {}),
    revalidateTag: mock(() => {}),
    isInProgressError: (error: unknown) => error instanceof Error && error.message === 'busy',
    isAuthenticationRequiredError: (error: unknown) => error instanceof AuthenticationRequiredError,
  }
}

describe('EPG mutation boundary', () => {
  it('shares sync semantics and immediately invalidates exact tags', async () => {
    const deps = dependencies()
    const mutation = createEpgMutation(deps)
    expect(await mutation.resyncEpgInventory({ apicHostId: 'h1', username: ' admin ', password: 'pw' }))
      .toEqual({ ok: true, syncedEpgs: 3, syncedBindings: 5 })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(1, 'epgs:all', { expire: 0 })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(2, 'epgs:host:h1', { expire: 0 })
  })

  it('does not let a failed audit skip invalidation', async () => {
    const deps = dependencies()
    deps.recordAudit.mockImplementation(async () => { throw new Error('audit down') })
    const result = await createEpgMutation(deps).resyncEpgInventoryForScheduler({ apicHostId: 'h1', hostName: 'Fabric', host: 'apic.local', username: 'u', password: 'p' })
    expect(result).toEqual({ syncedEpgs: 3, syncedBindings: 5 })
    expect(deps.revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('audits scheduler failure and rethrows it', async () => {
    const deps = dependencies()
    deps.resyncEpgs.mockImplementation(async () => { throw new Error('offline') })
    await expect(createEpgMutation(deps).resyncEpgInventoryForScheduler({ apicHostId: 'h1', hostName: 'Fabric', host: 'apic.local', username: 'u', password: 'p' })).rejects.toThrow('offline')
    expect(deps.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ status: 'failure', detail: 'offline' }))
    expect(deps.revalidateTag).not.toHaveBeenCalled()
  })

  it('maps only a missing session and propagates auth infrastructure failures', async () => {
    const missingSessionDeps = dependencies()
    missingSessionDeps.requireSession.mockImplementation(async () => {
      throw new AuthenticationRequiredError('missing')
    })
    await expect(createEpgMutation(missingSessionDeps).resyncEpgInventory({
      apicHostId: 'h1', username: 'u', password: 'p',
    })).resolves.toEqual({ ok: false, code: 'unauthorized', error: 'Unauthorized' })
    expect(missingSessionDeps.findHost).not.toHaveBeenCalled()

    const infrastructureDeps = dependencies()
    infrastructureDeps.requireSession.mockImplementation(async () => {
      throw new Error('session database unavailable')
    })
    await expect(createEpgMutation(infrastructureDeps).resyncEpgInventory({
      apicHostId: 'h1', username: 'u', password: 'p',
    })).rejects.toThrow('session database unavailable')
    expect(infrastructureDeps.findHost).not.toHaveBeenCalled()
  })
})
