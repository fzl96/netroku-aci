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

const storedSite = {
  id: 's1',
  name: 'HQ',
  address: '1 Main St',
  latitude: 1,
  longitude: 2,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
}

let findManyError: unknown = null
const siteFindMany = mock(async () => {
  if (findManyError) throw findManyError
  return [storedSite]
})
const siteCreate = mock(async () => storedSite)
const siteUpdateMany = mock(async () => ({ count: 1 }))
const siteFindUniqueOrThrow = mock(async () => storedSite)
const siteFindUnique = mock(async () => storedSite)
const siteDeleteMany = mock(async () => ({ count: 1 }))
const recordAudit = mock(async () => {})

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []
const revalidateCalls: Array<{ tag: string; options: unknown }> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession, requireAdmin }))
mock.module('@/lib/audit', () => ({ recordAudit }))
mock.module('@/lib/prisma', () => ({
  prisma: {
    site: {
      findMany: siteFindMany,
      create: siteCreate,
      updateMany: siteUpdateMany,
      findUniqueOrThrow: siteFindUniqueOrThrow,
      findUnique: siteFindUnique,
      deleteMany: siteDeleteMany,
    },
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

beforeEach(() => {
  authenticationError = null
  findManyError = null
  cacheCalls.length = 0
  revalidateCalls.length = 0
})

describe('sites authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getSites()).rejects.toBeInstanceOf(InventoryReadError)
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getSites().catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getSites', () => {
  it('caches under the shared inventory tag', async () => {
    const sites = await query.getSites()
    expect(sites).toEqual([storedSite])
    expect(cacheCalls.at(-1)?.options).toEqual({ tags: ['inventory:all'], revalidate: 28_800 })
  })
})

describe('site mutations', () => {
  it('expires the shared inventory tag after a create', async () => {
    await mutation.createSiteRecord({ name: 'HQ', address: null, latitude: null, longitude: null })
    expect(revalidateCalls).toEqual([{ tag: 'inventory:all', options: { expire: 0 } }])
  })

  it('turns a foreign-key conflict into a readable delete error', async () => {
    siteDeleteMany.mockImplementationOnce(async () => {
      throw Object.assign(new Error('FK'), { code: 'P2003' })
    })
    await expect(mutation.deleteSiteRecord('s1')).rejects.toThrow(
      'Cannot delete a site that still has racks',
    )
  })

  it('requires the admin role, not just a session', async () => {
    requireAdmin.mockImplementationOnce(async () => {
      throw new Error('Forbidden')
    })
    await expect(
      mutation.createSiteRecord({ name: 'HQ', address: null, latitude: null, longitude: null }),
    ).rejects.toThrow('Forbidden')
  })
})
