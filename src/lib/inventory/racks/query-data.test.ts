import { beforeEach, describe, expect, it, mock } from 'bun:test'

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

const storedRack = {
  id: 'r1',
  name: 'Rack 1',
  heightU: 42,
  siteId: 's1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
  devices: [{
    id: 'd1',
    name: 'sw-01',
    serialNumber: 'SN1',
    rackPosition: 1,
    deviceStack: null,
    stackMember: null,
    stackRole: null,
    vendor: 'Cisco',
    model: 'C9300',
    heightU: 1,
  }],
}

let findManyError: unknown = null
const rackFindMany = mock(async (args: { where?: { siteId?: string } }) => {
  if (findManyError) throw findManyError
  return args.where?.siteId === storedRack.siteId ? [storedRack] : []
})
const rackDropdownFindMany = mock(async () => [{ id: 'r1', name: 'Rack 1', site: { name: 'HQ' } }])
const rackCreate = mock(async () => storedRack)
const rackUpdateMany = mock(async () => ({ count: 1 }))
const rackFindUniqueOrThrow = mock(async () => storedRack)
const rackFindUnique = mock(async () => storedRack)
const rackDeleteMany = mock(async () => ({ count: 1 }))
const recordAudit = mock(async () => {})

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []
const revalidateCalls: Array<{ tag: string; options: unknown }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession, requireAdmin }))
mock.module('@/lib/audit', () => ({ recordAudit }))
mock.module('@/lib/prisma', () => ({ prisma: {
  rack: {
    findMany: (args: unknown) => {
      const a = args as { select?: unknown; where?: { siteId?: string } }
      return a.select ? rackDropdownFindMany() : rackFindMany(a)
    },
    create: rackCreate,
    updateMany: rackUpdateMany,
    findUniqueOrThrow: rackFindUniqueOrThrow,
    findUnique: rackFindUnique,
    deleteMany: rackDeleteMany,
  },
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

beforeEach(() => {
  authenticationError = null
  findManyError = null
  cacheCalls.length = 0
  revalidateCalls.length = 0
})

describe('racks authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getRacksBySite('s1')).rejects.toBeInstanceOf(InventoryReadError)
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getRacksBySite('s1').catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getRacksBySite', () => {
  it('flattens each rack device into a safe row shape', async () => {
    const racks = await query.getRacksBySite('s1')
    expect(racks).toHaveLength(1)
    expect(racks[0].devices[0]).toEqual(storedRack.devices[0])
  })

  it('keys the cache by site id and caches under the shared inventory tag', async () => {
    await query.getRacksBySite('s1')
    expect(cacheCalls.at(-1)?.key).toEqual(['inventory', 'racks', 'by-site', 's1'])
    expect(cacheCalls.at(-1)?.options).toEqual({ tags: ['inventory:all'], revalidate: 28_800 })
  })
})

describe('getAllRacksForDropdown', () => {
  it('returns the site-qualified dropdown options', async () => {
    expect(await query.getAllRacksForDropdown()).toEqual([{ id: 'r1', name: 'Rack 1', site: { name: 'HQ' } }])
  })
})

describe('rack mutations', () => {
  it('expires the shared inventory tag after a create', async () => {
    await mutation.createRackRecord({ name: 'Rack 1', heightU: 42, siteId: 's1' })
    expect(revalidateCalls).toEqual([{ tag: 'inventory:all', options: { expire: 0 } }])
  })

  it('reports a missing rack on update rather than throwing a Prisma error', async () => {
    rackUpdateMany.mockImplementationOnce(async () => ({ count: 0 }))
    await expect(mutation.updateRackRecord('missing', { name: 'Rack 1', heightU: 42, siteId: 's1' }))
      .rejects.toThrow('Rack not found')
  })

  it('requires the admin role, not just a session', async () => {
    requireAdmin.mockImplementationOnce(async () => { throw new Error('Forbidden') })
    await expect(mutation.deleteRackRecord('r1')).rejects.toThrow('Forbidden')
  })
})
