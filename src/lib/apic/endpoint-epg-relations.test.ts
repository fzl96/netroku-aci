import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { executeEpgResyncWrites } from './epg-resync'
import { acquireInventoryLock, reconcileEndpointEpgLinks } from './inventory-relations'
import type { EpgRow } from './epg-inventory'
import {
  createInventoryTestDb,
  inventoryTestWriter,
  RELATION_MIGRATION,
  ENDPOINT_EPG_MIGRATION,
} from '@/lib/test-fixtures/aci-inventory-db'

const dn = 'uni/tn-T1/ap-app/epg-web'
const now = new Date('2026-11-24T00:00:00Z')
const epg: EpgRow = {
  dn,
  name: 'web',
  tenant: 'T1',
  appProfile: 'app',
  description: '',
  bridgeDomain: '',
  bridgeDomainDn: '',
  bridgeDomainState: '',
  pcTag: '',
  preferredGroup: false,
  isolation: false,
  domains: [],
  providedContracts: [],
  consumedContracts: [],
  bindings: [],
}
let db: PGlite
beforeAll(async () => {
  db = await createInventoryTestDb()
})
afterAll(async () => {
  await db.close()
})
beforeEach(async () => {
  await db.exec('TRUNCATE endpoint, bd_snapshot, epg_snapshot CASCADE')
})

async function addPlacement(id: string, host = 'h1', active = true, epgDn = dn) {
  await db.query(
    'INSERT INTO endpoint (id, "apicHostId", mac, dn, "epgDn", "epgDescr", "isActive") VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [id, host, 'aa:bb:cc:dd:ee:ff', `${epgDn}/cep-aa:bb:cc:dd:ee:ff`, epgDn, 'Web', active],
  )
}
const links = async () =>
  (
    await db.query<{
      id: string
      epgId: string | null
      epgDn: string
      epgDescr: string
      isActive: boolean
    }>('SELECT id, "epgId", "epgDn", "epgDescr", "isActive" FROM endpoint ORDER BY id')
  ).rows

describe('Endpoint EPG relationships', () => {
  it('resolves either sync order, including historical rows, without crossing APIC hosts', async () => {
    const writer = inventoryTestWriter(db)
    await addPlacement('active')
    await addPlacement('history', 'h1', false)
    await addPlacement('other-fabric', 'h2')
    await addPlacement('prefix', 'h1', true, `${dn}-other`)
    await executeEpgResyncWrites(writer, 'h1', [epg], now)
    const first = (await links())[0].epgId
    expect(first).toBeString()
    expect((await links()).map((row) => row.epgId)).toEqual([first, first, null, null])
    await addPlacement('new-after-epg')
    // A worker from the previous app version can still insert during deployment.
    await db.query('UPDATE endpoint SET "epgDn" = $1 WHERE id = $2', ['', 'new-after-epg'])
    await writer.$transaction(async (tx) => {
      expect(await acquireInventoryLock(tx, 'h1')).toBe(true)
      await reconcileEndpointEpgLinks(tx, 'h1')
    })
    expect((await links()).find((row) => row.id === 'new-after-epg')?.epgId).toBe(first)
    expect((await links()).find((row) => row.id === 'new-after-epg')?.epgDn).toBe(dn)
    await executeEpgResyncWrites(writer, 'h1', [{ ...epg, description: 'Updated' }], now)
    expect((await links())[0].epgId).toBe(first)
  })

  it('preserves history on deletion, reconnects recreation, and rejects cross-host IDs', async () => {
    const writer = inventoryTestWriter(db)
    await addPlacement('history', 'h1', false)
    await executeEpgResyncWrites(writer, 'h1', [epg], now)
    const original = (await links())[0].epgId
    await executeEpgResyncWrites(writer, 'h1', [], now)
    expect(await links()).toEqual([
      { id: 'history', epgId: null, epgDn: dn, epgDescr: 'Web', isActive: false },
    ])
    await executeEpgResyncWrites(writer, 'h1', [epg], now)
    const recreated = (await links())[0].epgId
    expect(recreated).toBeString()
    expect(recreated).not.toBe(original)
    await addPlacement('other-fabric', 'h2')
    await expect(
      db.query('UPDATE endpoint SET "epgId" = $1 WHERE id = $2', [recreated, 'other-fabric']),
    ).rejects.toThrow('foreign key')
  })

  it('rolls back link clearing and pruning together when EPG refresh fails', async () => {
    await addPlacement('history', 'h1', false)
    await executeEpgResyncWrites(inventoryTestWriter(db), 'h1', [epg], now)
    const before = await links()
    await expect(
      executeEpgResyncWrites(inventoryTestWriter(db, { failTimestamp: true }), 'h1', [], now),
    ).rejects.toThrow('Timestamp write failed')
    expect(await links()).toEqual(before)
    expect((await db.query('SELECT id FROM epg_snapshot')).rows).toHaveLength(1)
  })

  it('backfills exact host + parent DN for existing active and historical placements', async () => {
    const legacy = await createInventoryTestDb(false)
    try {
      await legacy.exec(readFileSync(RELATION_MIGRATION, 'utf8'))
      await legacy.query(
        'INSERT INTO epg_snapshot (id, "apicHostId", dn, name, tenant, "appProfile") VALUES ($1, $2, $3, $4, $5, $6)',
        ['web', 'h1', dn, 'web', 'T1', 'app'],
      )
      await legacy.query(
        'INSERT INTO endpoint (id, "apicHostId", mac, dn, "isActive") VALUES ($1, $2, $3, $4, false), ($5, $6, $3, $4, true)',
        ['old', 'h1', 'aa', `${dn}/cep-aa`, 'other', 'h2'],
      )
      await legacy.exec(readFileSync(ENDPOINT_EPG_MIGRATION, 'utf8'))
      expect(
        (await legacy.query('SELECT id, "epgDn", "epgId" FROM endpoint ORDER BY id')).rows,
      ).toEqual([
        { id: 'old', epgDn: dn, epgId: 'web' },
        { id: 'other', epgDn: dn, epgId: null },
      ])
    } finally {
      await legacy.close()
    }
  })
})
