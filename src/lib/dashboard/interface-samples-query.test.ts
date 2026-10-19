import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { buildDashboardInterfaceSamplesQuery } from './interface-samples-query'
import { summarizeInterfaces, type InterfaceSummarySample } from './summary'

const db = new PGlite()

beforeAll(async () => {
  // Use the real table definitions and composite index, not an approximation.
  await db.exec(
    await readFile(
      new URL('../../../prisma/migrations/20260619012552_init/migration.sql', import.meta.url),
      'utf8',
    ),
  )
  await db.exec(`
    INSERT INTO apic_host (id, name, host, "updatedAt") VALUES
      ('h1', 'One', '192.0.2.1', now()), ('h2', 'Two', '192.0.2.2', now());
    INSERT INTO interface_snapshot (id, "apicHostId", dn, node, "ifName", "adminSt", "operSt") VALUES
      ('i1', 'h1', 'dn1', '101', 'eth1/1', 'up', 'up'),
      ('i2', 'h2', 'dn2', '101', 'eth1/1', 'up', 'down'),
      ('i3', 'h1', 'dn3', '101', 'eth1/3', 'down', 'down'),
      ('unsampled', 'h1', 'dn4', '101', 'eth1/4', 'up', 'up');
    INSERT INTO interface_sample (
      id, "apicHostId", "interfaceId", "sampledAt", "adminSt", "operSt", "operSpeed",
      "rxBytes", "rxPkts", "rxErrors", "rxDiscards", "rxCrcErrors", "rxAlignErrors",
      "txBytes", "txPkts", "txErrors", "txDiscards", "dRxErrors", "dTxErrors",
      "dRxDiscards", "dTxDiscards", "dRxCrcErrors", "dRxAlignErrors"
    ) SELECT
      interfaces.id || '-' || n, interfaces."apicHostId", interfaces.id,
      TIMESTAMP '2026-01-01' + n * INTERVAL '1 minute', 'up', 'up', '10G',
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      CASE WHEN interfaces.id = 'i1' AND n < 2000 THEN 9 ELSE NULL END,
      CASE WHEN interfaces.id = 'i2' AND n = 2000 THEN 9007199254740993 ELSE 0 END,
      0, 0, 0, CASE WHEN interfaces.id = 'i3' THEN -1 ELSE NULL END
    FROM interface_snapshot AS interfaces CROSS JOIN generate_series(1, 2000) AS n
    WHERE interfaces.id <> 'unsampled';
    ANALYZE interface_snapshot;
    ANALYZE interface_sample;
  `)
}, 30000)

afterAll(async () => {
  await db.close()
})

describe('dashboard latest interface samples in PostgreSQL', () => {
  it('returns only the newest sample per interface across hosts, ignoring old noise', async () => {
    const sql = buildDashboardInterfaceSamplesQuery()
    const rows = (await db.query<InterfaceSummarySample>(sql.text, sql.values)).rows

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.interfaceId).sort()).toEqual(['i1', 'i2', 'i3'])
    expect(
      rows.every((row) => new Date(row.sampledAt).toISOString() === '2026-01-02T09:20:00.000Z'),
    ).toBe(true)
    expect(
      summarizeInterfaces(
        [
          { adminSt: 'up', operSt: 'up', count: 2 },
          { adminSt: 'up', operSt: 'down', count: 1 },
          { adminSt: 'down', operSt: 'down', count: 1 },
        ],
        rows,
      ),
    ).toEqual({ total: 4, adminDown: 1, operDown: 1, noisy: 1 })
  })

  it('seeks at most one sample per interface instead of scanning retained history', async () => {
    const sql = buildDashboardInterfaceSamplesQuery()
    const result = await db.query(`EXPLAIN (ANALYZE, FORMAT JSON) ${sql.text}`, sql.values)
    type Plan = { Plans?: Plan[]; [key: string]: unknown }
    const root = (result.rows[0] as { 'QUERY PLAN': Array<{ Plan: Plan }> })['QUERY PLAN'][0].Plan
    const nodes: Plan[] = []
    function visit(plan: Plan) {
      nodes.push(plan)
      plan.Plans?.forEach(visit)
    }
    visit(root)
    const sampleReads = nodes.filter((node) => node['Relation Name'] === 'interface_sample')
    expect(sampleReads).toHaveLength(1)
    expect(sampleReads[0]['Index Name']).toBe('interface_sample_interfaceId_sampledAt_idx')
    expect(sampleReads[0]['Actual Rows']).toBeLessThanOrEqual(1)
    expect(sampleReads[0]['Actual Loops']).toBe(4)
  })
})
