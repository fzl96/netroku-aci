import { beforeEach, describe, expect, it, mock } from 'bun:test'

mock.module('server-only', () => ({}))

const { createApicHostMutation } = await import('./mutation')

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
const reportAuditError = mock(() => {})

const mutation = createApicHostMutation({
  requireAdmin,
  createHost,
  updateHost,
  deleteHost,
  recordAudit,
  invalidateEndpointReads,
  invalidateEpgReads,
  reportAuditError,
})

beforeEach(() => {
  requireAdmin.mockClear()
  createHost.mockClear()
  updateHost.mockClear()
  deleteHost.mockClear()
  recordAudit.mockClear()
  invalidateEndpointReads.mockClear()
  invalidateEpgReads.mockClear()
  reportAuditError.mockClear()
})

describe('APIC host endpoint-cache invalidation', () => {
  it('returns only the safe host shape after create', async () => {
    await expect(mutation.createApicHost({
      name: SAFE_HOST.name,
      host: SAFE_HOST.host,
    })).resolves.toEqual({ success: true, data: SAFE_HOST })
  })

  it('still invalidates after an update when audit persistence rejects', async () => {
    recordAudit.mockRejectedValueOnce(new Error('audit unavailable'))

    await expect(mutation.updateApicHost('host-1', {
      name: SAFE_HOST.name,
      host: SAFE_HOST.host,
    })).resolves.toEqual({ success: true, data: SAFE_HOST })
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
    expect(invalidateEndpointReads).toHaveBeenCalledWith('host-1')
    expect(invalidateEpgReads).toHaveBeenCalledWith('host-1')
    expect(reportAuditError).toHaveBeenCalledTimes(1)
  })
})
