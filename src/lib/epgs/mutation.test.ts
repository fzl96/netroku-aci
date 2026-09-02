import { describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
mock.module('next/cache', () => ({ revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn }))

const { createEpgMutation } = await import('./mutation')

function dependencies() {
  return {
    requireSession: mock(async () => ({ id: 'u1', userName: 'alice' })),
    findHost: mock(async () => ({ id: 'h1', name: 'Fabric', host: 'apic.local' })),
    resyncEpgs: mock(async () => ({ syncedEpgs: 3, syncedBindings: 5 })),
    recordAudit: mock(async () => {}),
    revalidateTag: mock(() => {}),
    isInProgressError: (error: unknown) => error instanceof Error && error.message === 'busy',
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
})
