import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }))

const { createBdMutation } = await import('./mutation')

class AuthenticationRequiredError extends Error {}

function dependencies() {
  return {
    requireSession: mock(async () => ({ id: 'u1', userName: 'alice' })),
    findHost: mock(async () => ({ id: 'h1', name: 'Fabric', host: 'apic.local' })),
    resyncBds: mock(async () => ({ syncedBds: 3 })),
    recordAudit: mock(async () => {}),
    revalidateTag: mock(() => {}),
    isInProgressError: (error: unknown) => error instanceof Error && error.message === 'busy',
    isAuthenticationRequiredError: (error: unknown) => error instanceof AuthenticationRequiredError,
  }
}

describe('Bridge Domain mutation boundary', () => {
  it('shares sync semantics and immediately invalidates exact tags', async () => {
    const deps = dependencies()
    const mutation = createBdMutation(deps)
    expect(
      await mutation.resyncBdInventory({ apicHostId: 'h1', username: ' admin ', password: 'pw' }),
    ).toEqual({ ok: true, syncedBds: 3 })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(1, 'bds:all', { expire: 0 })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(2, 'bds:host:h1', { expire: 0 })
  })

  it('does not let a failed audit skip invalidation', async () => {
    const deps = dependencies()
    deps.recordAudit.mockImplementation(async () => {
      throw new Error('audit down')
    })
    const result = await createBdMutation(deps).resyncBdInventory({
      apicHostId: 'h1',
      username: 'u',
      password: 'p',
    })
    expect(result).toEqual({ ok: true, syncedBds: 3 })
    expect(deps.revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('rethrows scheduler failure without a dataset audit', async () => {
    const deps = dependencies()
    deps.resyncBds.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(
      createBdMutation(deps).resyncBdInventoryForScheduler({
        apicHostId: 'h1',
        hostName: 'Fabric',
        host: 'apic.local',
        username: 'u',
        password: 'p',
      }),
    ).rejects.toThrow('offline')
    expect(deps.recordAudit).not.toHaveBeenCalled()
    expect(deps.revalidateTag).not.toHaveBeenCalled()
  })

  it('maps only a missing session and propagates auth infrastructure failures', async () => {
    const missingSessionDeps = dependencies()
    missingSessionDeps.requireSession.mockImplementation(async () => {
      throw new AuthenticationRequiredError('missing')
    })
    await expect(
      createBdMutation(missingSessionDeps).resyncBdInventory({
        apicHostId: 'h1',
        username: 'u',
        password: 'p',
      }),
    ).resolves.toEqual({ ok: false, code: 'unauthorized', error: 'Unauthorized' })
    expect(missingSessionDeps.findHost).not.toHaveBeenCalled()

    const infrastructureDeps = dependencies()
    infrastructureDeps.requireSession.mockImplementation(async () => {
      throw new Error('session database unavailable')
    })
    await expect(
      createBdMutation(infrastructureDeps).resyncBdInventory({
        apicHostId: 'h1',
        username: 'u',
        password: 'p',
      }),
    ).rejects.toThrow('session database unavailable')
    expect(infrastructureDeps.findHost).not.toHaveBeenCalled()
  })
})
