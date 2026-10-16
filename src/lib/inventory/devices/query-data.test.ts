import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { DeviceListParams } from './params'
import type { Prisma } from '@prisma/client'
import * as XLSX from 'xlsx'
import { buildDeviceWhere } from './params'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', role: 'member', userName: 'alice' }
})
const requireAdmin = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', role: 'admin', userName: 'alice' }
})

const storedDevice = {
  id: 'd1',
  name: 'sw-01',
  serialNumber: 'SN1',
  assetTag: 'AT1',
  managementIp: '10.0.0.1',
  status: 'ACTIVE',
  rackId: 'r1',
  rackPosition: 1,
  deviceStackId: null,
  stackMember: null,
  stackRole: null,
  vendor: 'Cisco',
  model: 'C9300',
  heightU: 1,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  rack: { id: 'r1', name: 'Rack 1', site: { id: 's1', name: 'HQ' } },
  deviceStack: null,
}

let findManyError: unknown = null
let storedDevices = [storedDevice]
const listCalls: Prisma.DeviceFindManyArgs[] = []
const deviceFindMany = mock(async (args?: Prisma.DeviceFindManyArgs) => {
  if (findManyError) throw findManyError
  if (args) listCalls.push(args)
  return storedDevices
})
const deviceCount = mock(async () => 1)
const deviceFindUnique = mock(async () => storedDevice)
const deviceCreate = mock(async () => storedDevice)
const deviceFindUniqueOrThrow = mock(async () => storedDevice)
const deviceStackFindMany = mock(async () => [])
const recordAudit = mock(async () => {})

let placementCollides = false
function transaction(callback: (tx: unknown) => unknown) {
  return callback({
    $queryRaw: async () => [],
    device: {
      findFirst: async () => null,
      findUnique: placementCollides ? async () => ({ heightU: 2 }) : deviceFindUnique,
      findMany: placementCollides
        ? async () => [{ id: 'other', rackPosition: 5, heightU: 2 }]
        : async () => [],
      findUniqueOrThrow: deviceFindUniqueOrThrow,
      create: deviceCreate,
      update: async () => storedDevice,
      updateMany: async () => ({ count: 0 }),
      count: async () => 0,
    },
    deviceStack: { findFirst: async () => null, create: async () => ({ id: 'stack1' }) },
    rack: { findUnique: async () => ({ heightU: placementCollides ? 10 : 42 }) },
  })
}

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []
const revalidateCalls: Array<{ tag: string; options: unknown }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession, requireAdmin }))
mock.module('@/lib/audit', () => ({ recordAudit }))
mock.module('@/lib/prisma', () => ({
  prisma: {
    device: {
      findMany: deviceFindMany,
      count: deviceCount,
      findUnique: deviceFindUnique,
      findUniqueOrThrow: deviceFindUniqueOrThrow,
    },
    deviceStack: { findMany: deviceStackFindMany },
    $transaction: transaction,
  },
}))
mock.module('next/cache', () => ({
  unstable_cache: (
    fn: () => unknown,
    key: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    cacheCalls.push({ key, options })
    return fn
  },
  revalidateTag: (tag: string, options: unknown) => {
    revalidateCalls.push({ tag, options })
  },
}))

const query = await import('./query')
const mutation = await import('./mutation')
const { InventoryReadError } = await import('@/lib/inventory/errors')
const { POST: exportDevices } = await import('@/app/api/inventory/devices/export/route')

const base: DeviceListParams = { query: '', sites: [], sources: [], page: 1 }

beforeEach(() => {
  authenticationError = null
  findManyError = null
  storedDevices = [storedDevice]
  listCalls.length = 0
  placementCollides = false
  cacheCalls.length = 0
  revalidateCalls.length = 0
})

describe('devices authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getDevices(base)).rejects.toBeInstanceOf(InventoryReadError)
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getDevices(base).catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getDevices', () => {
  it('flattens the rack and stack relations into a safe row shape', async () => {
    const page = await query.getDevices(base)
    expect(page.devices[0].rack).toEqual(storedDevice.rack)
    expect(page.devices[0].deviceStack).toBeNull()
  })

  it('selects only the declared rack/site fields, not the full related rows', async () => {
    listCalls.length = 0
    await query.getDevices(base)
    // `include` would fetch every Rack/Site column (address, coordinates,
    // heightU, timestamps…); this locks the read to an explicit `select`.
    expect(listCalls.at(-1)?.select?.rack).toEqual({
      select: { id: true, name: true, site: { select: { id: true, name: true } } },
    })
  })

  it('keys the cache by the query, site filter and page', async () => {
    await query.getDevices({ query: 'sw', sites: ['s1', 's2'], sources: [], page: 2 })
    expect(cacheCalls.at(-1)?.key).toEqual(['inventory', 'devices', 'list', 'sw', 's1,s2', '', '2'])
    expect(cacheCalls.at(-1)?.options).toEqual({ tags: ['inventory:all'], revalidate: 28_800 })
  })

  it('selects source kinds for physical devices and their stacks', async () => {
    await query.getDevices(base)
    expect(listCalls.at(-1)?.select?.source).toMatchObject({ select: { kind: true } })
    expect(listCalls.at(-1)?.select?.deviceStack).toMatchObject({
      select: { source: { select: { kind: true } } },
    })
  })

  it('keeps source filters in separate cache entries', async () => {
    await query.getDevices({ ...base, sources: ['ACI'] })
    const aciKey = cacheCalls.at(-1)?.key
    await query.getDevices({ ...base, sources: ['LEGACY'] })
    expect(cacheCalls.at(-1)?.key).not.toEqual(aciKey)
  })

  it('provides separate matching and inventory totals for the export choices', async () => {
    deviceCount.mockResolvedValueOnce(3).mockResolvedValueOnce(25)
    const page = await query.getDevices({ ...base, sources: ['ACI'] })
    expect(page.total).toBe(3)
    expect(page.allTotal).toBe(25)
  })

  it('reuses the list total for the whole inventory when there are no filters', async () => {
    const calls = deviceCount.mock.calls.length
    const page = await query.getDevices(base)
    expect(page.allTotal).toBe(page.total)
    expect(deviceCount.mock.calls.length - calls).toBe(1)
  })

  it('preserves a disconnected device source and a stack source in safe rows', () => {
    const source = {
      id: 'source1',
      kind: 'ACI' as const,
      sourceLabel: 'Retained ACI source',
      conflictReason: null,
      nodeSnapshotId: null,
      legacyDeviceId: null,
    }
    const device = { ...storedDevice, status: 'ACTIVE' as const, source }
    expect(query.toSafeWithRack(device).source).toEqual(source)
    expect(
      query.toSafeWithRack({
        ...device,
        source: null,
        deviceStack: { id: 'stack1', name: 'Core', source: { kind: 'LEGACY' } },
      }).deviceStack?.source,
    ).toEqual({ kind: 'LEGACY' })
  })
})

describe('device exports', () => {
  function request(body: unknown) {
    return new Request('http://localhost/api/inventory/devices/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('exports all matching rows without pagination and reuses search, site and source filters', async () => {
    storedDevices = Array.from({ length: 25 }, (_, index) => ({ ...storedDevice, id: `d${index}` }))
    const filters = { query: 'core', sites: ['s1'], sources: ['LEGACY' as const] }
    const rows = await query.getDeviceExportData({ scope: 'filtered', filters })
    expect(rows).toHaveLength(25)
    expect(listCalls.at(-1)?.where).toEqual(buildDeviceWhere({ ...filters, page: 1 }))
    expect(listCalls.at(-1)?.skip).toBeUndefined()
    expect(listCalls.at(-1)?.take).toBeUndefined()
  })

  it('ignores supplied filters for all-device downloads and returns a readable single-sheet XLSX', async () => {
    storedDevices = Array.from({ length: 25 }, (_, index) => ({
      ...storedDevice,
      id: `d${index}`,
      serialNumber: `SN${index}`,
    }))
    const response = await exportDevices(
      request({
        scope: 'all',
        filters: { query: 'no-match', sites: ['elsewhere'], sources: ['ACI'] },
      }),
    )
    expect(response.status).toBe(200)
    expect(listCalls.at(-1)?.where).toEqual({})
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    expect(response.headers.get('Content-Disposition')).toMatch(
      /attachment; filename="inventory-devices-all-.*\.xlsx"/,
    )
    const workbook = XLSX.read(await response.arrayBuffer(), { type: 'array' })
    expect(workbook.SheetNames).toEqual(['Devices'])
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.Devices)).toHaveLength(25)
  })

  it('does not query inventory or download data without a session', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getDeviceExportData({ scope: 'all' })).rejects.toBeInstanceOf(
      InventoryReadError,
    )
    const response = await exportDevices(request({ scope: 'all' }))
    expect(response.status).toBe(401)
    expect(listCalls).toHaveLength(0)
  })

  it('reports empty exports and rejects invalid filters', async () => {
    storedDevices = []
    const empty = await exportDevices(request({ scope: 'all' }))
    expect(empty.status).toBe(422)
    listCalls.length = 0
    const invalid = await exportDevices(
      request({
        scope: 'filtered',
        filters: { query: '', sites: [], sources: ['OTHER'] },
      }),
    )
    expect(invalid.status).toBe(400)
    expect(listCalls).toHaveLength(0)
  })
})

describe('getAllDevices', () => {
  it('never exposes stack membership as a bare id-only reference', async () => {
    const catalog = await query.getAllDevices()
    expect(catalog[0].id).toBe(storedDevice.id)
  })
})

describe('device mutations', () => {
  it('expires the shared inventory tag after a placement change', async () => {
    await mutation.updateDevicePlacementRecord('d1', 'r1', 5)
    expect(revalidateCalls).toEqual([{ tag: 'inventory:all', options: { expire: 0 } }])
  })

  it('rejects a placement that collides with an existing device', async () => {
    placementCollides = true
    await expect(mutation.updateDevicePlacementRecord('d1', 'r1', 5)).rejects.toThrow(
      'Cannot place device here due to rack collision',
    )
  })

  it('requires the admin role, not just a session', async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error('Forbidden')
    })
    await expect(mutation.deleteDeviceRecord('d1')).rejects.toThrow('Forbidden')
  })
})
