import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { ParsedImportRow } from '@/lib/inventory/csv'

let authError: unknown = null
const requireAdmin = mock(async () => {
  if (authError) throw authError
  return { id: 'u1', role: 'admin', userName: 'alice' }
})

const row: ParsedImportRow = {
  rowIndex: 1,
  hostname: 'sw-01',
  serialNumber: 'SN1',
  assetTag: null,
  managementIp: null,
  status: 'ACTIVE' as ParsedImportRow['status'],
  vendor: 'Cisco',
  model: 'C9300',
  heightU: 1,
  site: null,
  rack: null,
  rackPosition: null,
  stackName: null,
  stackRole: null,
  switchId: null,
}

const siteFindMany = mock(async () => [])
const rackFindMany = mock(async () => [])
const deviceFindMany = mock(async () => [])
const deviceStackFindMany = mock(async () => [])
const deviceFindUnique = mock(async () => null)
const deviceCreate = mock(async () => ({}))
const recordAudit = mock(async () => {})
const revalidateCalls: Array<{ tag: string; options: unknown }> = []

function transaction(callback: (tx: unknown) => unknown) {
  return callback({
    site: { findMany: siteFindMany, create: async () => ({ id: 'site1', name: 'HQ' }) },
    rack: { findMany: rackFindMany, create: async () => ({ id: 'rack1' }) },
    deviceStack: { findMany: deviceStackFindMany, create: async () => ({ id: 'stack1' }) },
    device: {
      findUnique: deviceFindUnique,
      create: deviceCreate,
      update: async () => ({}),
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
  })
}

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ requireAdmin }))
mock.module('@/lib/audit', () => ({ recordAudit }))
mock.module('@/lib/prisma', () => ({ prisma: {
  site: { findMany: siteFindMany },
  rack: { findMany: rackFindMany },
  device: { findMany: deviceFindMany },
  deviceStack: { findMany: deviceStackFindMany },
  $transaction: transaction,
} }))
mock.module('next/cache', () => ({
  revalidateTag: (tag: string, options: unknown) => { revalidateCalls.push({ tag, options }) },
}))

const mutation = await import('./mutation')

beforeEach(() => {
  authError = null
  revalidateCalls.length = 0
})

describe('previewDeviceImport', () => {
  it('requires the admin role', async () => {
    authError = new Error('Forbidden')
    await expect(mutation.previewDeviceImport([row])).rejects.toThrow('Forbidden')
  })

  it('classifies a row with no matching serial as a create', async () => {
    const result = await mutation.previewDeviceImport([row])
    expect(result.rowStates[0].action).toBe('CREATE')
    expect(result.canImport).toBe(true)
  })

  it('surfaces client-flagged malformed rows as import errors', async () => {
    const result = await mutation.previewDeviceImport([], [{
      rowIndex: 2, hostname: 'bad', serialNumber: '', assetTag: null, managementIp: null,
      vendor: '', model: '', heightU: 1, site: null, rack: null, rackPosition: null,
      stackName: null, errors: ['Missing serial number'],
    }])
    expect(result.summary.errorCount).toBe(1)
    expect(result.rowStates[0].errors).toEqual(['Missing serial number'])
  })
})

describe('commitDeviceImport', () => {
  it('expires the shared inventory tag after a successful commit', async () => {
    await mutation.commitDeviceImport([row])
    expect(revalidateCalls).toEqual([{ tag: 'inventory:all', options: { expire: 0 } }])
  })

  it('refuses to commit when there are no rows to import', async () => {
    await expect(mutation.commitDeviceImport([]))
      .rejects.toThrow('No valid devices to import')
    expect(revalidateCalls).toEqual([])
  })
})
