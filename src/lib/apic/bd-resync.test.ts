import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type { PGlite } from '@electric-sql/pglite'
import { executeBdResyncWrites, BdResyncInProgressError } from './bd-resync'
import { createInventoryTestDb, inventoryTestWriter } from '@/lib/test-fixtures/aci-inventory-db'
import { bdFixture } from '../../../tests/fixtures/bd'

let db: PGlite
beforeAll(async () => {
  db = await createInventoryTestDb()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec(
    'TRUNCATE bd_snapshot, epg_snapshot CASCADE; UPDATE apic_host SET "lastBdSyncAt" = NULL, "lastEpgSyncAt" = NULL',
  )
})
const now = new Date('2026-10-20T00:00:00Z')
describe('relational BD refresh', () => {
  it('keeps stable BD IDs and EPG identities even before full EPG collection', async () => {
    const row = bdFixture()
    const writer = inventoryTestWriter(db)
    expect(await executeBdResyncWrites(writer, 'h1', [row, row], now)).toEqual({ syncedBds: 1 })
    const first = await db.query<{ id: string }>('SELECT id FROM bd_snapshot')
    expect((await db.query('SELECT "epgId", tenant, dn FROM bd_epg_relation')).rows).toEqual([
      { epgId: null, tenant: 'T1', dn: row.epgs[0].dn },
    ])
    await executeBdResyncWrites(writer, 'h1', [{ ...row, description: 'Updated' }], now)
    expect((await db.query('SELECT id FROM bd_snapshot')).rows).toEqual(first.rows)
    expect((await db.query('SELECT description FROM bd_snapshot')).rows).toEqual([
      { description: 'Updated' },
    ])
  })
  it('clears only the refreshed fabric and preserves its EPG snapshots on BD deletion', async () => {
    const writer = inventoryTestWriter(db)
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    await executeBdResyncWrites(writer, 'h2', [bdFixture()], now)
    await executeBdResyncWrites(writer, 'h1', [], now)
    expect((await db.query('SELECT "apicHostId" FROM bd_snapshot')).rows).toEqual([
      { apicHostId: 'h2' },
    ])
    expect((await db.query('SELECT "apicHostId" FROM bd_epg_relation')).rows).toEqual([
      { apicHostId: 'h2' },
    ])
    expect(
      (await db.query('SELECT "lastBdSyncAt" FROM apic_host WHERE id = $1', ['h1'])).rows[0],
    ).toEqual({ lastBdSyncAt: now })
  })
  it('rejects busy hosts and rolls back configuration, membership and timestamps together on failure', async () => {
    await expect(
      executeBdResyncWrites(inventoryTestWriter(db, { busy: true }), 'h1', [bdFixture()], now),
    ).rejects.toBeInstanceOf(BdResyncInProgressError)
    const writer = inventoryTestWriter(db)
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    await expect(
      executeBdResyncWrites(
        inventoryTestWriter(db, { failTimestamp: true }),
        'h1',
        [{ ...bdFixture(), description: 'Failed change', epgs: [] }],
        new Date(),
      ),
    ).rejects.toThrow('Timestamp write failed')
    expect((await db.query('SELECT description FROM bd_snapshot')).rows).toEqual([
      { description: 'Web network' },
    ])
    expect((await db.query('SELECT dn FROM bd_epg_relation')).rows).toHaveLength(1)
    expect(
      (await db.query('SELECT "lastBdSyncAt" FROM apic_host WHERE id = $1', ['h1'])).rows[0],
    ).toEqual({ lastBdSyncAt: now })
  })
})
