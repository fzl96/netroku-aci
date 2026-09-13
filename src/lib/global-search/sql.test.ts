import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { buildSearchSql } from './sql'
import { RECORD_GROUPS, type RecordGroup } from './types'
import type { SearchRow } from './results'

const db = new PGlite({ extensions: { pg_trgm } })
async function search(group: RecordGroup, query: string, history = false) {
  const sql = buildSearchSql(group, query, history)
  return (await db.query<SearchRow>(sql.text, sql.values)).rows
}

beforeAll(async () => {
  const root = new URL('../../../prisma/migrations/', import.meta.url)
  for (const dir of (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    await db.exec(await readFile(new URL(`${dir.name}/migration.sql`, root), 'utf8'))
  }
  await db.exec(`
    INSERT INTO apic_host (id,name,host,"updatedAt") VALUES ('h1','APIC One','192.0.2.1',now()), ('h2','APIC Two','192.0.2.2',now());
    INSERT INTO endpoint (id,"apicHostId",mac,ip,vlan,dn,node,interface,"isActive","lastSeenAt") VALUES
      ('e1','h1','AA:BB:CC:DD:EE:FF','192.0.2.123','vlan-10','dn1','101','eth1/1',true,'2026-01-01'),
      ('e2','h1','AA:BB:CC:DD:EE:FF','192.0.2.124','vlan-10','dn2','101','eth1/2',false,'2026-02-01'),
      ('e3','h2','AA:BB:CC:DD:EE:FF','192.0.2.125','vlan-10','dn3','101','eth1/1',true,'2026-01-01'),
      ('e4','h1','11:22:33:44:55:66','192.0.2.126','vlan-10','dn4','101','eth1/1',false,'2026-01-01');
    INSERT INTO site (id,name,"updatedAt") VALUES ('s1','Test Site',now());
    INSERT INTO rack (id,name,"heightU","siteId","updatedAt") VALUES ('r1','Test Rack',42,'s1',now());
    INSERT INTO device (id,name,"serialNumber",status,vendor,model,"heightU","updatedAt") VALUES
      ('d1','test','serial-1','RETIRED','Vendor','Model',1,now()),
      ('d2','test-prefix','serial-2','PLANNED','Vendor','Model',1,now()),
      ('d3','a-test-substring','serial-3','ACTIVE','Vendor','Model',1,now()),
      ('d4','literal_%','serial-4','MAINTENANCE','Vendor','Model',1,now());
    INSERT INTO node_snapshot (id,"apicHostId",dn,"nodeId",name,present) VALUES
      ('n1','h1','node1','101','test-node',true),('n2','h1','node2','102','test-absent',false);
    INSERT INTO epg_snapshot (id,"apicHostId",dn,name,tenant,"appProfile",domains,"providedContracts","consumedContracts") VALUES
      ('epg1','h1','uni/tn-test/ap-test/epg-test','test-epg','test','test',ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[]);
    INSERT INTO legacy_device (id,site,"siteKey",hostname,"hostnameKey","managementIp","deviceType","updatedAt") VALUES
      ('l1','Test Site','test','test-switch','test-switch','198.51.100.1','switch',now());
    INSERT INTO legacy_endpoint (id,"deviceId",mac,ip,"ipKey",vlan,interface,"interfaceKey","isActive") VALUES
      ('le1','l1','aa:bb:cc:dd:ee:ff','198.51.100.2','198.51.100.2','10','Gi1/1','gi1/1',true),
      ('le2','l1','aa:bb:cc:dd:ee:ff','198.51.100.3','198.51.100.3','10','Gi1/2','gi1/2',false);
  `)
}, 30000)
afterAll(async () => {
  await db.close()
})

describe('PostgreSQL global search', () => {
  it('executes every provider against the actual migrated schema', async () => {
    for (const group of Object.keys(RECORD_GROUPS) as RecordGroup[]) {
      await search(group, 'test')
    }
    expect(await search('epgs', 'test')).toHaveLength(1)
    expect(await search('racks', 'test')).toHaveLength(1)
    expect(await search('sites', 'test')).toHaveLength(1)
    expect(await search('legacy-devices', 'test')).toHaveLength(1)
  })
  it('groups placements per source, normalizes MAC formats and prefers active placements', async () => {
    const current = await search('aci-endpoints', 'aabb.ccdd.eeff')
    expect(current).toHaveLength(2)
    expect(current.map((row) => row.sourceId)).toEqual(['h1', 'h2'])
    const history = await search('aci-endpoints', 'aa-bb-cc-dd-ee-ff', true)
    expect(history[0].id).toBe('e1')
    expect(history[0].matches).toBe(2)
    expect(await search('aci-endpoints', '11:22:33')).toHaveLength(0)
    expect(await search('aci-endpoints', '11:22:33', true)).toHaveLength(1)
    expect((await search('legacy-endpoints', 'aabbcc', true))[0].matches).toBe(2)
  })
  it('ranks exact, prefix and substring matches before limiting and includes inventory statuses', async () => {
    expect((await search('devices', 'TEST')).map((row) => row.id)).toEqual(['d1', 'd2', 'd3'])
    expect((await search('devices', 'test'))[0].detail).toContain('RETIRED')
    expect((await search('nodes', 'test')).map((row) => row.id)).toEqual(['n1'])
  })
  it('treats wildcard and injection text literally', async () => {
    expect((await search('devices', 'literal_%')).map((row) => row.id)).toEqual(['d4'])
    expect(await search('devices', "' OR true --")).toHaveLength(0)
  })
  it('applies the limit to endpoint groups instead of placement episodes', async () => {
    await db.exec(`INSERT INTO endpoint (id,"apicHostId",mac,ip,vlan,dn,node,interface,"isActive")
      SELECT 'many-' || i, 'h1', '77:88:99:AA:BB:CC', '203.0.113.1', 'vlan-10', 'many-' || i, '101', 'eth1/1', false FROM generate_series(1,20) i;`)
    const rows = await search('aci-endpoints', 'vlan-10', true)
    expect(rows).toHaveLength(4)
    expect(rows.find((row) => row.identity === '77:88:99:AA:BB:CC')?.matches).toBe(20)
  })
  it('has usable trigram indexes for the actual search expressions', async () => {
    const sql = buildSearchSql('devices', 'serial-1', false)
    await db.exec('SET enable_seqscan = off')
    const plan = await db.query(`EXPLAIN ${sql.text}`, sql.values)
    expect(JSON.stringify(plan.rows)).toContain('device_global_search_trgm_idx')
    await db.exec('RESET enable_seqscan')
  })
})
