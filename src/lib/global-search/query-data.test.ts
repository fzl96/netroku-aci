import { beforeEach, describe, expect, it, mock } from 'bun:test'
import type { Prisma } from '@prisma/client'

class AuthenticationRequiredError extends Error {}
let denied = false
let failedTable = ''
const requireSession = mock(async () => {
  if (denied) throw new AuthenticationRequiredError()
  return { id: 'member', role: 'member', userName: 'Operator' }
})
const execute = mock(async () => 0)
const query = mock(async (sql: Prisma.Sql) => {
  if (failedTable && sql.text.includes(`FROM ${failedTable} r`))
    throw new Error('Private database details')
  return [
    {
      id: 'record-1',
      title: 'Device',
      detail: '192.0.2.1',
      sourceId: 'source-1',
      sourceName: 'Site',
      identity: 'record-1',
      active: true,
      matches: 1,
      secret: 'must not serialize',
    },
  ]
})
const transaction = mock(async (operation: (tx: unknown) => Promise<unknown>) =>
  operation({ $executeRaw: execute, $queryRaw: query }),
)
mock.module('server-only', () => ({}))
mock.module('@/lib/auth', () => ({ AuthenticationRequiredError, requireSession }))
mock.module('@/lib/prisma', () => ({ prisma: { $transaction: transaction } }))
const { searchRecords } = await import('./query')
const { GET } = await import('@/app/api/global-search/route')

beforeEach(() => {
  denied = false
  failedTable = ''
  transaction.mockClear()
  execute.mockClear()
  query.mockClear()
})

describe('protected global search', () => {
  it('requires authentication before any database search, even for short queries', async () => {
    denied = true
    await expect(searchRecords('device')).rejects.toBeInstanceOf(AuthenticationRequiredError)
    await expect(searchRecords('')).rejects.toBeInstanceOf(AuthenticationRequiredError)
    expect(transaction).not.toHaveBeenCalled()
    const response = await GET(new Request('http://test/api/global-search?query=device'))
    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('does not scan records for short input', async () => {
    expect(await searchRecords('ip')).toEqual({ groups: [] })
    expect(transaction).not.toHaveBeenCalled()
  })
  it('isolates failed groups and exposes only safe result fields', async () => {
    failedTable = 'epg_snapshot'
    const response = await searchRecords('device')
    expect(response.groups).toHaveLength(8)
    expect(response.groups.find((group) => group.id === 'epgs')).toEqual({
      id: 'epgs',
      label: 'ACI EPGs',
      items: [],
      error: true,
    })
    expect(response.groups.find((group) => group.id === 'devices')?.items).toHaveLength(1)
    expect(JSON.stringify(response)).not.toContain('secret')
    expect(JSON.stringify(response)).not.toContain('Private database')
    expect(execute).toHaveBeenCalledTimes(8)
  })
  it('validates requests and can retry one group without reading the others', async () => {
    expect(
      (await GET(new Request(`http://test/api/global-search?query=${'x'.repeat(121)}`))).status,
    ).toBe(400)
    expect(
      (await GET(new Request('http://test/api/global-search?query=test&group=__proto__'))).status,
    ).toBe(400)
    expect(transaction).not.toHaveBeenCalled()
    const response = await GET(
      new Request('http://test/api/global-search?query=test&group=devices'),
    )
    expect(response.status).toBe(200)
    expect(transaction).toHaveBeenCalledTimes(1)
    expect((await response.json()).groups[0].id).toBe('devices')
  })
})
