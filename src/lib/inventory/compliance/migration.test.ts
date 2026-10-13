import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
beforeAll(async () => {
  await db.exec(`CREATE TABLE device (id TEXT PRIMARY KEY);
    CREATE TABLE device_stack (id TEXT PRIMARY KEY);
    INSERT INTO device VALUES ('device-1'), ('device-2');
    INSERT INTO device_stack VALUES ('stack-1');`)
  await db.exec(
    await readFile(
      new URL(
        '../../../../prisma/migrations/20261013000000_inventory_compliance/migration.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  )
}, 30000)
afterAll(() => db.close())

async function save(
  id: string,
  deviceId: string | null,
  stackId: string | null,
  at = '2026-10-13T01:00:00Z',
) {
  return db.query(
    `INSERT INTO inventory_config (id,"deviceId","deviceStackId","rawConfig",platform,"collectedAt","updatedAt")
    VALUES ($1,$2,$3,'hostname switch','iosxe',$4,now())`,
    [id, deviceId, stackId, at],
  )
}

describe('configuration ownership and latest snapshot migration', () => {
  it('starts both policies disabled and prohibits enabling an empty list', async () => {
    expect(
      (
        await db.query(
          'SELECT service,enabled,"expectedIps" FROM compliance_policy ORDER BY service',
        )
      ).rows,
    ).toEqual([
      { service: 'ntp', enabled: false, expectedIps: [] },
      { service: 'tacacs', enabled: false, expectedIps: [] },
    ])
    await expect(
      db.exec("UPDATE compliance_policy SET enabled=true WHERE service='ntp'"),
    ).rejects.toThrow()
    await db.exec(
      "UPDATE compliance_policy SET enabled=true,\"expectedIps\"=ARRAY['192.0.2.1'] WHERE service='ntp'",
    )
  })

  it('requires exactly one existing owner and one snapshot per device or stack', async () => {
    await expect(save('neither', null, null)).rejects.toThrow()
    await expect(save('both', 'device-1', 'stack-1')).rejects.toThrow()
    await expect(save('missing', 'not-found', null)).rejects.toThrow()
    await save('device-config', 'device-1', null)
    await save('stack-config', null, 'stack-1')
    await expect(save('duplicate-device', 'device-1', null)).rejects.toThrow()
    await expect(save('duplicate-stack', null, 'stack-1')).rejects.toThrow()
  })

  it('rejects delayed updates, accepts a newer collection and cascades asset deletion', async () => {
    await expect(
      db.exec(
        `UPDATE inventory_config SET "collectedAt"='2026-10-12',"rawConfig"='old' WHERE id='device-config'`,
      ),
    ).rejects.toThrow('older configuration')
    await db.exec(
      `UPDATE inventory_config SET "collectedAt"='2026-10-14',"rawConfig"='new' WHERE id='device-config'`,
    )
    expect(
      (await db.query(`SELECT "rawConfig" FROM inventory_config WHERE id='device-config'`)).rows,
    ).toEqual([{ rawConfig: 'new' }])
    await db.exec(
      `DELETE FROM device WHERE id='device-1'; DELETE FROM device_stack WHERE id='stack-1';`,
    )
    expect((await db.query('SELECT id FROM inventory_config')).rows).toEqual([])
  })
})
