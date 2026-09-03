import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {} }))

const { createNodeMutation } = await import('./mutation')

class AuthenticationRequiredError extends Error {}

function dependencies() {
  return {
    requireSession: mock(async () => ({ id: 'u1', userName: 'alice' })),
    findHost: mock(async () => ({ id: 'h1', name: 'Fabric', host: 'apic.local' })),
    resyncNodes: mock(async () => ({ syncedNodes: 3, syncedComponents: 5, nodesOnline: 3 })),
    recordAudit: mock(async () => {}),
    revalidateTag: mock(() => {}),
    isAuthenticationRequiredError: (error: unknown) => error instanceof AuthenticationRequiredError,
  }
}

describe('node mutation boundary', () => {
  it('shares sync semantics and immediately invalidates exact tags', async () => {
    const deps = dependencies()
    const mutation = createNodeMutation(deps)
    await expect(
      mutation.resyncNodeInventory({ apicHostId: 'h1', username: ' admin ', password: 'pw' }),
    ).resolves.toEqual({ ok: true, syncedNodes: 3, syncedComponents: 5, nodesOnline: 3 })
    expect(deps.resyncNodes).toHaveBeenCalledWith({
      apicHostId: 'h1',
      host: 'apic.local',
      username: 'admin',
      password: 'pw',
    })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(1, 'nodes:all', { expire: 0 })
    expect(deps.revalidateTag).toHaveBeenNthCalledWith(2, 'nodes:host:h1', { expire: 0 })
  })

  it('does not let a failed audit skip invalidation', async () => {
    const deps = dependencies()
    deps.recordAudit.mockImplementation(async () => {
      throw new Error('audit down')
    })
    await expect(
      createNodeMutation(deps).resyncNodeInventoryForScheduler({
        apicHostId: 'h1',
        hostName: 'Fabric',
        host: 'apic.local',
        username: 'u',
        password: 'p',
      }),
    ).resolves.toEqual({ syncedNodes: 3, syncedComponents: 5, nodesOnline: 3 })
    expect(deps.revalidateTag).toHaveBeenCalledTimes(2)
  })

  it('audits scheduler failures once and rethrows them without invalidation', async () => {
    const deps = dependencies()
    deps.resyncNodes.mockImplementation(async () => {
      throw new Error('offline')
    })
    await expect(
      createNodeMutation(deps).resyncNodeInventoryForScheduler({
        apicHostId: 'h1',
        hostName: 'Fabric',
        host: 'apic.local',
        username: 'u',
        password: 'p',
      }),
    ).rejects.toThrow('offline')
    expect(deps.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failure', detail: 'offline' }),
    )
    expect(deps.recordAudit).toHaveBeenCalledTimes(1)
    expect(deps.revalidateTag).not.toHaveBeenCalled()
  })

  it('maps only missing sessions and propagates auth infrastructure failures', async () => {
    const missing = dependencies()
    missing.requireSession.mockImplementation(async () => {
      throw new AuthenticationRequiredError()
    })
    await expect(
      createNodeMutation(missing).resyncNodeInventory({
        apicHostId: 'h1',
        username: 'u',
        password: 'p',
      }),
    ).resolves.toEqual({ ok: false, code: 'unauthorized', error: 'Unauthorized' })
    expect(missing.findHost).not.toHaveBeenCalled()

    const broken = dependencies()
    broken.requireSession.mockImplementation(async () => {
      throw new Error('session database unavailable')
    })
    await expect(
      createNodeMutation(broken).resyncNodeInventory({
        apicHostId: 'h1',
        username: 'u',
        password: 'p',
      }),
    ).rejects.toThrow('session database unavailable')
  })
})
