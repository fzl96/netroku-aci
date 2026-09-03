import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { DeviceListParams } from './params'

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
const listCalls: Array<{ select?: { rack?: unknown } }> = []
const deviceFindMany = mock(async (args?: { select?: { rack?: unknown } }) => {
  if (findManyError) throw findManyError
  if (args) listCalls.push(args)
  return [storedDevice]
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
    device: {
      findFirst: async () => null,
      findUnique: placementCollides
        ? async () => ({ heightU: 2 })
        : deviceFindUnique,
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
mock.module('@/lib/prisma', () => ({ prisma: {
  device: {
    findMany: (args: { skip?: number; select?: { rack?: unknown } }) => {
      // Both the paged list and the flat catalog select now use `select`;
      // only the paged list passes skip/take, so key off that instead.
      return args.skip === undefined ? Promise.resolve([storedDevice]) : deviceFindMany(args)
    },
    count: deviceCount,
    findUnique: deviceFindUnique,
    findUniqueOrThrow: deviceFindUniqueOrThrow,
  },
  deviceStack: { findMany: deviceStackFindMany },
  $transaction: transaction,
} }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown, key: string[], options: { tags: string[]; revalidate: number }) => {
    cacheCalls.push({ key, options }); return fn
  },
  revalidateTag: (tag: string, options: unknown) => { revalidateCalls.push({ tag, options }) },
}))

const query = await import('./query')
const mutation = await import('./mutation')
const { InventoryReadError } = await import('@/lib/inventory/errors')

const base: DeviceListParams = { query: '', page: 1 }

beforeEach(() => {
  authenticationError = null
  findManyError = null
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

  it('keys the cache by the query and page', async () => {
    await query.getDevices({ query: 'sw', page: 2 })
    expect(cacheCalls.at(-1)?.key).toEqual(['inventory', 'devices', 'list', 'sw', '2'])
    expect(cacheCalls.at(-1)?.options).toEqual({ tags: ['inventory:all'], revalidate: 28_800 })
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
    await expect(mutation.updateDevicePlacementRecord('d1', 'r1', 5))
      .rejects.toThrow('Cannot place device here due to rack collision')
  })

  it('requires the admin role, not just a session', async () => {
    requireAdmin.mockImplementationOnce(async () => { throw new Error('Forbidden') })
    await expect(mutation.deleteDeviceRecord('d1')).rejects.toThrow('Forbidden')
  })
})
