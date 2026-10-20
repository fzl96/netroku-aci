import { afterEach, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { createInventoryTestDb, RELATION_MIGRATION } from '@/lib/test-fixtures/aci-inventory-db'
import { bdFixture } from '../../../tests/fixtures/bd'

let db: PGlite | undefined
afterEach(async () => {
  if (db) await db.close()
  db = undefined
})
async function legacyDb() {
  db = await createInventoryTestDb(false)
  return db
}
async function addBd(database: PGlite, hostId: string, id: string, dn: string, epgs: unknown) {
  await database.query(
    `INSERT INTO bd_snapshot (id, "apicHostId", dn, name, tenant, subnets, "l3Outs", epgs, "epgCount", "searchText")
    VALUES ($1, $2, $3, 'web', 'common', '[]', '{}', $4, 99, 'old denormalized EPG text')`,
    [id, hostId, dn, JSON.stringify(epgs)],
  )
}
async function addEpg(database: PGlite, hostId: string, id: string, dn: string) {
  await database.query(
    `INSERT INTO epg_snapshot (id, "apicHostId", dn, name, tenant, "appProfile", "bridgeDomain", domains, "providedContracts", "consumedContracts")
    VALUES ($1, $2, $3, 'web', 'T1', 'app', 'web', '{}', '{}', '{}')`,
    [id, hostId, dn],
  )
}
const migrate = (database: PGlite) => database.exec(readFileSync(RELATION_MIGRATION, 'utf8'))

describe('existing BD/EPG data migration', () => {
  it('backfills exact same-host EPG references and preserves uncollected identities without creating fake EPG snapshots', async () => {
    const database = await legacyDb()
    const epg = bdFixture().epgs[0]
    const missing = {
      ...epg,
      dn: 'uni/tn-T2/ap-other/epg-pending',
      tenant: 'T2',
      appProfile: 'other',
      name: 'pending',
    }
    await addEpg(database, 'h1', 'epg1', epg.dn)
    await addEpg(database, 'h2', 'epg2', epg.dn)
    await addBd(database, 'h1', 'bd1', 'uni/tn-common/BD-web', [epg, missing])
    await addBd(database, 'h2', 'bd2', 'uni/tn-common/BD-web', [epg])
    await migrate(database)
    const relations = (
      await database.query(
        'SELECT "apicHostId", "bdId", "epgId", dn FROM bd_epg_relation ORDER BY "apicHostId", dn',
      )
    ).rows
    expect(relations).toEqual([
      { apicHostId: 'h1', bdId: 'bd1', epgId: 'epg1', dn: epg.dn },
      { apicHostId: 'h1', bdId: 'bd1', epgId: null, dn: missing.dn },
      { apicHostId: 'h2', bdId: 'bd2', epgId: 'epg2', dn: epg.dn },
    ])
    expect((await database.query('SELECT id FROM epg_snapshot ORDER BY id')).rows).toEqual([
      { id: 'epg1' },
      { id: 'epg2' },
    ])
    expect(
      (
        await database.query<{ searchText: string }>(
          'SELECT "searchText" FROM bd_snapshot WHERE id = $1',
          ['bd1'],
        )
      ).rows[0].searchText,
    ).not.toContain('old denormalized EPG text')
    expect(
      (
        await database.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'bd_snapshot' AND column_name IN ('epgs', 'epgCount')",
        )
      ).rows,
    ).toEqual([])
    expect(
      (
        await database.query(
          'SELECT count(*)::int AS count FROM bd_epg_relation WHERE "bdId" = $1',
          ['bd1'],
        )
      ).rows,
    ).toEqual([{ count: 2 }])
  })

  it('enforces same-fabric foreign keys, one membership per EPG, and host cascade behavior', async () => {
    const database = await legacyDb()
    const epg = bdFixture().epgs[0]
    await addEpg(database, 'h1', 'epg1', epg.dn)
    await addEpg(database, 'h2', 'epg2', epg.dn)
    await addBd(database, 'h1', 'bd1', 'uni/tn-common/BD-web', [epg])
    await addBd(database, 'h2', 'bd2', 'uni/tn-common/BD-web', [epg])
    await migrate(database)
    await expect(
      database.query('UPDATE bd_epg_relation SET "epgId" = $1 WHERE "bdId" = $2', ['epg2', 'bd1']),
    ).rejects.toThrow('foreign key constraint')
    await expect(
      database.query('UPDATE bd_epg_relation SET "bdId" = $1 WHERE "bdId" = $2', ['bd2', 'bd1']),
    ).rejects.toThrow('foreign key constraint')
    await expect(
      database.query(
        'INSERT INTO bd_epg_relation SELECT $1, "apicHostId", "bdId", "epgId", dn, name, tenant, "appProfile" FROM bd_epg_relation WHERE "bdId" = $2',
        ['duplicate', 'bd1'],
      ),
    ).rejects.toThrow('unique constraint')
    await expect(
      database.query('DELETE FROM epg_snapshot WHERE id = $1', ['epg1']),
    ).rejects.toThrow('foreign key constraint')
    await database.query('DELETE FROM apic_host WHERE id = $1', ['h1'])
    expect((await database.query('SELECT "bdId", "epgId" FROM bd_epg_relation')).rows).toEqual([
      { bdId: 'bd2', epgId: 'epg2' },
    ])
  })

  it('leaves name-only EPGs unlinked when no verified membership exists', async () => {
    const database = await legacyDb()
    await addEpg(database, 'h1', 'epg1', bdFixture().epgs[0].dn)
    await addBd(database, 'h1', 'bd1', 'uni/tn-common/BD-web', [])
    await migrate(database)
    expect((await database.query('SELECT id FROM bd_epg_relation')).rows).toEqual([])
    expect((await database.query('SELECT id FROM epg_snapshot')).rows).toEqual([{ id: 'epg1' }])
  })

  it('rolls back schema and data when legacy memberships conflict instead of picking a BD', async () => {
    const database = await legacyDb()
    const epg = bdFixture().epgs[0]
    await addBd(database, 'h1', 'bd1', 'uni/tn-common/BD-web', [epg])
    await addBd(database, 'h1', 'bd2', 'uni/tn-T1/BD-web', [epg])
    await expect(migrate(database)).rejects.toThrow('Conflicting legacy')
    await database.exec('ROLLBACK')
    expect((await database.query('SELECT epgs FROM bd_snapshot ORDER BY id')).rows).toEqual([
      { epgs: [epg] },
      { epgs: [epg] },
    ])
    expect(
      (
        await database.query(
          "SELECT table_name FROM information_schema.tables WHERE table_name = 'bd_epg_relation'",
        )
      ).rows,
    ).toEqual([])
  })
})
