import { beforeEach, describe, expect, it, mock } from 'bun:test'

class AuthenticationRequiredError extends Error {}
let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'u1', role: 'member', userName: 'alice' }
})

const storedHost = {
  id: 'h1',
  name: 'Fabric A',
  host: 'apic.example.com',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
}

let findManyError: unknown = null
const apicHostFindMany = mock(async () => {
  if (findManyError) throw findManyError
  return [storedHost]
})

const cacheCalls: Array<{ key: string[]; options: { tags: string[]; revalidate: number } }> = []

mock.module('server-only', () => ({}))
// Bun mocks are process-wide: mutation.ts also imports requireAdmin from this
// module for its production wiring, so the stand-in must be complete.
mock.module('@/lib/auth', () => ({
  AuthenticationRequiredError,
  requireSession,
  requireAdmin: mock(async () => ({ id: 'u1', role: 'admin', userName: 'alice' })),
}))
mock.module('@/lib/prisma', () => ({ prisma: { apicHost: { findMany: apicHostFindMany } } }))
mock.module('next/cache', () => ({
  unstable_cache: (
    fn: () => unknown,
    key: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    cacheCalls.push({ key, options })
    return fn
  },
  revalidateTag: () => {},
}))

const query = await import('./query')

beforeEach(() => {
  authenticationError = null
  findManyError = null
  cacheCalls.length = 0
})

describe('apic-hosts authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authenticationError = new AuthenticationRequiredError('nope')
    await expect(query.getApicHosts()).rejects.toBeInstanceOf(query.ApicHostReadError)
  })

  it('propagates unexpected authorization failures unchanged', async () => {
    authenticationError = new Error('database on fire')
    await expect(query.getApicHosts()).rejects.toThrow('database on fire')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getApicHosts().catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getApicHosts', () => {
  it('returns the safe host shape, newest first, under the shared tag', async () => {
    expect(await query.getApicHosts()).toEqual([storedHost])
    expect(cacheCalls.at(-1)?.options).toEqual({ tags: ['apic-hosts:all'], revalidate: 28_800 })
  })
})
