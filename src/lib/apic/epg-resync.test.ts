import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import type { PGlite } from '@electric-sql/pglite'
import { executeEpgResyncWrites, EpgResyncInProgressError } from './epg-resync'
import { executeBdResyncWrites } from './bd-resync'
import { createInventoryTestDb, inventoryTestWriter } from '@/lib/test-fixtures/aci-inventory-db'
import { bdFixture } from '../../../tests/fixtures/bd'
import type { EpgRow } from './epg-inventory'

function makeEpg(overrides: Partial<EpgRow> = {}): EpgRow {
  return {
    dn: 'uni/tn-T1/ap-app/epg-web',
    name: 'web',
    tenant: 'T1',
    appProfile: 'app',
    description: '',
    bridgeDomain: 'web',
    bridgeDomainDn: 'uni/tn-common/BD-web',
    bridgeDomainState: 'formed',
    pcTag: '16386',
    preferredGroup: false,
    isolation: false,
    domains: ['PHYS'],
    providedContracts: ['web-contract'],
    consumedContracts: [],
    bindings: [
      {
        dn: 'uni/tn-T1/ap-app/epg-web/rspathAtt-[port]',
        pathTDn: 'port',
        pod: '1',
        node: '101',
        port: 'eth1/10',
        pathType: 'port',
        encap: 'vlan-10',
        mode: 'trunk',
      },
    ],
    ...overrides,
  }
}
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
describe('relational EPG refresh', () => {
  it('attaches BD-discovered identities, preserves snapshot/binding IDs and handles either refresh order', async () => {
    const writer = inventoryTestWriter(db)
    const row = makeEpg()
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    expect(await executeEpgResyncWrites(writer, 'h1', [row], now)).toEqual({
      syncedEpgs: 1,
      syncedBindings: 1,
    })
    const first = (await db.query<{ id: string }>('SELECT id FROM epg_snapshot')).rows
    const binding = (await db.query('SELECT id FROM epg_path_binding')).rows
    expect((await db.query('SELECT "epgId" FROM bd_epg_relation')).rows).toEqual([
      { epgId: first[0].id },
    ])
    await executeEpgResyncWrites(writer, 'h1', [{ ...row, description: 'Updated' }], now)
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    expect((await db.query('SELECT id FROM epg_snapshot')).rows).toEqual(first)
    expect((await db.query('SELECT id FROM epg_path_binding')).rows).toEqual(binding)
    await executeEpgResyncWrites(writer, 'h2', [row], now)
    expect(
      (await db.query('SELECT dn FROM bd_epg_relation WHERE "apicHostId" = $1', ['h2'])).rows,
    ).toHaveLength(0)
    await executeBdResyncWrites(writer, 'h2', [bdFixture()], now)
    expect(
      (
        await db.query<{ epgId: string | null }>(
          'SELECT "epgId" FROM bd_epg_relation WHERE "apicHostId" = $1',
          ['h2'],
        )
      ).rows[0].epgId,
    ).toBeString()
  })
  it('moves an EPG between BDs, honors cross-tenant targets, and clears removed/unformed relationships', async () => {
    const writer = inventoryTestWriter(db)
    const local = { ...bdFixture(), dn: 'uni/tn-T1/BD-web', tenant: 'T1', epgs: [] }
    await executeBdResyncWrites(writer, 'h1', [bdFixture(), local], now)
    await executeEpgResyncWrites(writer, 'h1', [makeEpg()], now)
    const tenant = async () =>
      (
        await db.query<{ tenant: string }>(
          'SELECT b.tenant FROM bd_epg_relation r JOIN bd_snapshot b ON b.id = r."bdId"',
        )
      ).rows.map((r) => r.tenant)
    expect(await tenant()).toEqual(['common'])
    await executeEpgResyncWrites(writer, 'h1', [makeEpg({ bridgeDomainDn: '' })], now)
    expect(await tenant()).toEqual(['T1'])
    await executeEpgResyncWrites(writer, 'h1', [makeEpg({ bridgeDomainState: 'unformed' })], now)
    expect(await tenant()).toEqual([])
    await executeEpgResyncWrites(
      writer,
      'h1',
      [makeEpg({ bridgeDomain: '', bridgeDomainDn: '', bridgeDomainState: '' })],
      now,
    )
    expect(await tenant()).toEqual([])
    await executeEpgResyncWrites(writer, 'h1', [], now)
    expect((await db.query('SELECT id FROM epg_snapshot')).rows).toEqual([])
    expect((await db.query('SELECT id FROM epg_path_binding')).rows).toEqual([])
  })
  it('BD deletion clears memberships without deleting EPGs and recreation reconnects them', async () => {
    const writer = inventoryTestWriter(db)
    await executeEpgResyncWrites(writer, 'h1', [makeEpg()], now)
    const first = (await db.query<{ id: string }>('SELECT id FROM epg_snapshot')).rows
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    await executeBdResyncWrites(writer, 'h1', [], now)
    expect((await db.query('SELECT id FROM epg_snapshot')).rows).toEqual(first)
    expect((await db.query('SELECT id FROM bd_epg_relation')).rows).toEqual([])
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    expect((await db.query('SELECT "epgId" FROM bd_epg_relation')).rows).toEqual([
      { epgId: first[0].id },
    ])
  })
  it('keeps the previous snapshots and relationships when a refresh fails or its shared lock is busy', async () => {
    const writer = inventoryTestWriter(db)
    await executeBdResyncWrites(writer, 'h1', [bdFixture()], now)
    await executeEpgResyncWrites(writer, 'h1', [makeEpg()], now)
    await expect(
      executeEpgResyncWrites(inventoryTestWriter(db, { busy: true }), 'h1', [], now),
    ).rejects.toBeInstanceOf(EpgResyncInProgressError)
    await expect(
      executeEpgResyncWrites(
        inventoryTestWriter(db, { failTimestamp: true }),
        'h1',
        [],
        new Date(),
      ),
    ).rejects.toThrow('Timestamp write failed')
    expect((await db.query('SELECT id FROM epg_snapshot')).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM epg_path_binding')).rows).toHaveLength(1)
    expect((await db.query('SELECT id FROM bd_epg_relation')).rows).toHaveLength(1)
    expect(
      (await db.query('SELECT "lastEpgSyncAt" FROM apic_host WHERE id = $1', ['h1'])).rows[0],
    ).toEqual({ lastEpgSyncAt: now })
  })
})
