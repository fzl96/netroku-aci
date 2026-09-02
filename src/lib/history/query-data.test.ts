import { beforeEach, describe, expect, it, mock } from 'bun:test'
import * as React from 'react'

class AuthenticationRequiredError extends Error {}

let authenticationError: unknown = null
const requireSession = mock(async () => {
  if (authenticationError) throw authenticationError
  return { id: 'user-1', role: 'member', userName: 'alice' }
})

const count = mock(async () => 21)
const findMany = mock(async () => [{
  id: 'log-1',
  createdAt: new Date('2026-09-01T10:00:00.000Z'),
  userId: 'user-1',
  userName: 'alice',
  action: 'resync.interfaces',
  target: 'Fabric A',
  status: 'success',
  detail: 'synced 42',
  payload: [{ secret: 'stored-json-is-visible-by-design' }],
  internalOnly: 'must-not-cross-the-seam',
}])

const cacheCalls: Array<{
  key: string[]
  options: { tags: string[]; revalidate: number }
}> = []

mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({
  prisma: { auditLog: { count, findMany } },
}))
mock.module('next/cache', () => ({
  unstable_cache: (
    producer: () => unknown,
    key: string[],
    options: { tags: string[]; revalidate: number },
  ) => {
    cacheCalls.push({ key, options })
    return producer
  },
}))
mock.module('react', () => ({ ...React, cache: (fn: unknown) => fn }))

const history = await import('./query')

beforeEach(() => {
  authenticationError = null
  requireSession.mockClear()
  count.mockClear()
  findMany.mockClear()
  cacheCalls.length = 0
})

describe('history query interface', () => {
  it('exposes an authenticated page-oriented read', () => {
    expect(typeof history.getHistoryPage).toBe('function')
  })

  it('authorizes before using the persistent cache', async () => {
    await history.getHistoryPage({ query: '', action: 'all', page: 1 })

    expect(requireSession).toHaveBeenCalledTimes(1)
    expect(cacheCalls).toHaveLength(1)
  })

  it('maps only a missing session and propagates auth infrastructure failures', async () => {
    authenticationError = new AuthenticationRequiredError('missing')
    await expect(history.getHistoryPage({ query: '', action: 'all', page: 1 }))
      .rejects.toBeInstanceOf(history.HistoryReadError)
    expect(cacheCalls).toHaveLength(0)

    authenticationError = new Error('session database unavailable')
    await expect(history.getHistoryPage({ query: '', action: 'all', page: 1 }))
      .rejects.toThrow('session database unavailable')
    expect(cacheCalls).toHaveLength(0)
  })

  it('caches normalized reads for eight hours and clamps before selecting rows', async () => {
    const result = await history.getHistoryPage({ query: '  core  ', action: 'all', page: 9 })

    expect(cacheCalls).toEqual([{
      key: ['history', 'page', 'core', 'all', '9'],
      options: { tags: ['history:all'], revalidate: 28_800 },
    }])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20 }))
    expect(result.page).toBe(2)
  })

  it('returns an explicit serialized DTO from inside the cache producer', async () => {
    const result = await history.getHistoryPage({ query: '', action: 'all', page: 1 })

    expect(result.logs[0]).toEqual({
      id: 'log-1',
      createdAt: '2026-09-01T10:00:00.000Z',
      userId: 'user-1',
      userName: 'alice',
      action: 'resync.interfaces',
      target: 'Fabric A',
      status: 'success',
      detail: 'synced 42',
      payload: [{ secret: 'stored-json-is-visible-by-design' }],
    })
    expect(JSON.stringify(result)).not.toContain('internalOnly')
  })
})
