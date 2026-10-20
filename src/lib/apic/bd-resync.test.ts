import { describe, expect, it } from 'bun:test'
import { executeBdResyncWrites, BdResyncInProgressError, type BdWriteClient } from './bd-resync'
import { bdFixture } from '../../../tests/fixtures/bd'

function client(acquired = true, writeFails = false) {
  const calls: Array<[string, unknown]> = []
  const db = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        $queryRaw: async () => {
          calls.push(['lock', null])
          return [{ acquired }]
        },
        bdSnapshot: {
          deleteMany: async (args: unknown) => calls.push(['delete', args]),
          createMany: async (args: unknown) => {
            calls.push(['create', args])
            if (writeFails) throw new Error('write failed')
          },
        },
        apicHost: { update: async (args: unknown) => calls.push(['timestamp', args]) },
      }),
  } as unknown as BdWriteClient
  return { db, calls }
}
describe('BD snapshot replacement', () => {
  it('locks before writes, scopes deletions to one host and stamps a successful empty snapshot', async () => {
    const { db, calls } = client()
    const now = new Date()
    expect(await executeBdResyncWrites(db, 'h1', [], now)).toEqual({ syncedBds: 0 })
    expect(calls).toEqual([
      ['lock', null],
      ['delete', { where: { apicHostId: 'h1' } }],
      ['timestamp', { where: { id: 'h1' }, data: { lastBdSyncAt: now } }],
    ])
  })
  it('deduplicates BDs and persists relationship identities with their configuration', async () => {
    const { db, calls } = client()
    const row = bdFixture()
    expect(await executeBdResyncWrites(db, 'h2', [row, row], new Date())).toEqual({ syncedBds: 1 })
    expect(calls.find((c) => c[0] === 'create')?.[1]).toMatchObject({
      data: [
        {
          apicHostId: 'h2',
          dn: row.dn,
          epgs: row.epgs,
          epgCount: 1,
          searchText: expect.stringContaining('10.0.0.1/24'),
        },
      ],
    })
  })
  it('does not delete data when the host lock is busy or advance freshness after a failed write', async () => {
    const busy = client(false)
    await expect(executeBdResyncWrites(busy.db, 'h1', [], new Date())).rejects.toBeInstanceOf(
      BdResyncInProgressError,
    )
    expect(busy.calls).toHaveLength(1)
    const failed = client(true, true)
    await expect(executeBdResyncWrites(failed.db, 'h1', [bdFixture()], new Date())).rejects.toThrow(
      'write failed',
    )
    expect(failed.calls.some((c) => c[0] === 'timestamp')).toBe(false)
  })
})
