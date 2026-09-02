import { beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))
const revalidateTag = mock(() => {})
mock.module('next/cache', () => ({
  revalidateTag,
  unstable_cache: (operation: (...args: unknown[]) => unknown) => operation,
}))

const mutationModule = await import('./mutation')
const { createApicHostMutation } = mutationModule

const SAFE_HOST = {
  id: 'host-1',
  name: 'Fabric A',
  host: 'apic.example.com',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-02T00:00:00.000Z'),
}
const STORED_HOST = {
  ...SAFE_HOST,
  lastInterfaceSyncAt: new Date('2026-01-03T00:00:00.000Z'),
  lastNodeSyncAt: null,
  lastEpgSyncAt: null,
}

const requireAdmin = mock(async () => ({ id: 'user-1', userName: 'admin' }))
const createHost = mock(async () => STORED_HOST)
const updateHost = mock(async () => STORED_HOST)
const deleteHost = mock(async () => STORED_HOST)
const recordAudit = mock(async () => {})
const invalidateEndpointReads = mock(() => {})
const invalidateEpgReads = mock(() => {})
const invalidateNodeReads = mock(() => {})
const invalidateInterfaceReads = mock(() => {})
const invalidateApicHostReads = mock(() => {})
const reportAuditError = mock(() => {})
const reportInvalidationError = mock(() => {})

const mutation = createApicHostMutation({
  requireAdmin,
  createHost,
  updateHost,
  deleteHost,
  recordAudit,
  invalidateEndpointReads,
  invalidateEpgReads,
  invalidateNodeReads,
  invalidateInterfaceReads,
  invalidateApicHostReads,
  reportAuditError,
  reportInvalidationError,
})

beforeEach(() => {
  revalidateTag.mockClear()
  requireAdmin.mockClear()
  createHost.mockClear()
  updateHost.mockClear()
  deleteHost.mockClear()
  recordAudit.mockClear()
  invalidateEndpointReads.mockClear()
  invalidateEpgReads.mockClear()
  invalidateNodeReads.mockClear()
  invalidateInterfaceReads.mockClear()
  invalidateApicHostReads.mockClear()
  reportAuditError.mockClear()
  reportInvalidationError.mockClear()
})

describe('APIC host endpoint-cache invalidation', () => {
  it('expires the exact APIC-host cache tag immediately', () => {
    const invalidateApicHostReads = (
      mutationModule as typeof mutationModule & { invalidateApicHostReads?: () => void }
    ).invalidateApicHostReads

    expect(invalidateApicHostReads).toBeDefined()
    invalidateApicHostReads?.()
    expect(revalidateTag).toHaveBeenCalledWith('apic-hosts:all', { expire: 0 })
  })

  it('returns only the safe host shape after create', async () => {
    await expect(mutation.createApicHost({
      name: SAFE_HOST.name,
      host: SAFE_HOST.host,
    })).resolves.toEqual({ success: true, data: SAFE_HOST })
  })

  it('still invalidates host reads after create when audit persistence rejects', async () => {
    recordAudit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(mutation.createApicHost({
      name: SAFE_HOST.name,
      host: SAFE_HOST.host,
    })).resolves.toEqual({ success: true, data: SAFE_HOST })
    expect(invalidateApicHostReads).toHaveBeenCalledTimes(1)
    expect(reportAuditError).toHaveBeenCalledTimes(1)
  })

  it('still invalidates after an update when audit persistence rejects', async () => {
    recordAudit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(mutation.updateApicHost('host-1', {
      name: SAFE_HOST.name,
      host: SAFE_HOST.host,
    })).resolves.toEqual({ success: true, data: SAFE_HOST })
    expect(invalidateApicHostReads).toHaveBeenCalledTimes(1)
    expect(invalidateEndpointReads).toHaveBeenCalledWith('host-1')
    expect(invalidateEpgReads).not.toHaveBeenCalled()
    expect(reportAuditError).toHaveBeenCalledTimes(1)
  })

  it('still invalidates after a delete when audit persistence rejects', async () => {
    recordAudit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(mutation.deleteApicHost('host-1')).resolves.toEqual({
      success: true,
      data: undefined,
    })
    expect(invalidateApicHostReads).toHaveBeenCalledTimes(1)
    expect(invalidateEndpointReads).toHaveBeenCalledWith('host-1')
    expect(invalidateEpgReads).toHaveBeenCalledWith('host-1')
    expect(invalidateNodeReads).toHaveBeenCalledWith('host-1')
    expect(invalidateInterfaceReads).toHaveBeenCalledWith('host-1')
    expect(reportAuditError).toHaveBeenCalledTimes(1)
  })

  it('reports an invalidation failure without skipping later evictions or failing a committed delete', async () => {
    invalidateApicHostReads.mockImplementationOnce(() => {
      throw new Error('cache unavailable')
    })

    await expect(mutation.deleteApicHost('host-1')).resolves.toEqual({
      success: true,
      data: undefined,
    })
    expect(invalidateEndpointReads).toHaveBeenCalledWith('host-1')
    expect(invalidateEpgReads).toHaveBeenCalledWith('host-1')
    expect(invalidateNodeReads).toHaveBeenCalledWith('host-1')
    expect(invalidateInterfaceReads).toHaveBeenCalledWith('host-1')
    expect(reportInvalidationError).toHaveBeenCalledTimes(1)
  })

  it('does not invalidate caches when a durable host write fails', async () => {
    createHost.mockRejectedValueOnce(new Error('create failed'))
    updateHost.mockRejectedValueOnce(new Error('update failed'))
    deleteHost.mockRejectedValueOnce(new Error('delete failed'))

    await mutation.createApicHost({ name: SAFE_HOST.name, host: SAFE_HOST.host })
    await mutation.updateApicHost('host-1', { name: SAFE_HOST.name, host: SAFE_HOST.host })
    await mutation.deleteApicHost('host-1')

    expect(invalidateApicHostReads).not.toHaveBeenCalled()
    expect(invalidateEndpointReads).not.toHaveBeenCalled()
    expect(invalidateEpgReads).not.toHaveBeenCalled()
    expect(invalidateNodeReads).not.toHaveBeenCalled()
    expect(invalidateInterfaceReads).not.toHaveBeenCalled()
  })
})
