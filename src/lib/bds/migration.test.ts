import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
beforeAll(async () => {
  await db.exec('CREATE TABLE apic_host (id TEXT PRIMARY KEY)')
  await db.exec(
    readFileSync('prisma/migrations/20261020000000_add_bd_inventory/migration.sql', 'utf8'),
  )
  await db.exec("INSERT INTO apic_host (id) VALUES ('h1'), ('h2')")
})
afterAll(async () => {
  await db.close()
})
const insert = `INSERT INTO bd_snapshot (id, "apicHostId", dn, name, tenant, subnets, "l3Outs", epgs, "searchText") VALUES ($1, $2, 'uni/tn-common/BD-web', 'web', 'common', '[]', '{}', '[]', 'web')`
describe('BD inventory migration', () => {
  it('allows identical DNs on different fabrics while enforcing uniqueness within a fabric', async () => {
    await db.query(insert, ['b1', 'h1'])
    await db.query(insert, ['b2', 'h2'])
    await expect(db.query(insert, ['b3', 'h1'])).rejects.toThrow('unique constraint')
    expect((await db.query('SELECT * FROM bd_snapshot')).rows).toHaveLength(2)
  })
  it('rolls back a failed replacement and cascades deletion only for its host', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.query('DELETE FROM bd_snapshot WHERE "apicHostId" = $1', ['h1'])
        await tx.query('UPDATE apic_host SET "lastBdSyncAt" = CURRENT_TIMESTAMP WHERE id = $1', [
          'h1',
        ])
        await tx.query(insert, ['bad', 'missing-host'])
      }),
    ).rejects.toThrow('foreign key constraint')
    expect(
      (await db.query('SELECT id FROM bd_snapshot WHERE "apicHostId" = $1', ['h1'])).rows,
    ).toEqual([{ id: 'b1' }])
    expect(
      (await db.query('SELECT "lastBdSyncAt" FROM apic_host WHERE id = $1', ['h1'])).rows,
    ).toEqual([{ lastBdSyncAt: null }])
    await db.query('DELETE FROM apic_host WHERE id = $1', ['h1'])
    expect((await db.query('SELECT id FROM bd_snapshot')).rows).toEqual([{ id: 'b2' }])
  })
})
