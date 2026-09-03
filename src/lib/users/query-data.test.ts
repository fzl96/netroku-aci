import { beforeEach, describe, expect, it, mock } from 'bun:test'

class AuthenticationRequiredError extends Error {}
let authError: unknown = null
const requireAdmin = mock(async () => {
  if (authError) throw authError
  return { id: 'admin-1', role: 'admin', userName: 'admin' }
})

const storedUser = {
  id: 'u1',
  username: 'alice',
  displayUsername: 'Alice',
  name: 'alice',
  role: 'admin',
  createdAt: new Date('2026-01-01T00:00:00Z'),
}

let findManyError: unknown = null
const userFindMany = mock(async () => {
  if (findManyError) throw findManyError
  return [storedUser, { ...storedUser, id: 'u2', username: null, displayUsername: null, name: 'bob', role: null }]
})

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireAdmin }))
mock.module('@/lib/prisma', () => ({ prisma: { user: { findMany: userFindMany } } }))
mock.module('next/cache', () => ({
  unstable_cache: (fn: () => unknown) => fn,
  revalidateTag: () => {},
}))

const query = await import('./query')

beforeEach(() => {
  authError = null
  findManyError = null
})

describe('users authorization', () => {
  it('maps an unauthenticated session to a purpose read error', async () => {
    authError = new AuthenticationRequiredError('nope')
    await expect(query.getUsers()).rejects.toBeInstanceOf(query.UserReadError)
  })

  it('propagates a non-admin session unchanged, not as a read error', async () => {
    authError = new Error('Forbidden')
    await expect(query.getUsers()).rejects.toThrow('Forbidden')
  })

  it('reports a failed read as a retryable purpose error', async () => {
    findManyError = new Error('connection reset')
    const error = await query.getUsers().catch((e: unknown) => e)
    expect((error as { code: string }).code).toBe('read-failed')
  })
})

describe('getUsers', () => {
  it('falls back to the internal name when username is unset, and defaults role to member', async () => {
    const users = await query.getUsers()
    expect(users[0]).toEqual({
      id: 'u1', username: 'alice', displayUsername: 'Alice', role: 'admin',
      createdAt: storedUser.createdAt,
    })
    expect(users[1]).toEqual({
      id: 'u2', username: 'bob', displayUsername: 'bob', role: 'member',
      createdAt: storedUser.createdAt,
    })
  })
})
