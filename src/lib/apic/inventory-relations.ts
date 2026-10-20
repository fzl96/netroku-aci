import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import type { BdEpg } from '@/lib/bds/types'

export interface InventoryTransaction {
  $executeRaw(query: Prisma.Sql): Promise<number>
  $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T>
}
export interface InventoryWriteClient {
  $transaction<T>(
    fn: (tx: InventoryTransaction) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}

// BD and EPG writes both change membership. Serialize them together per APIC host.
export const INVENTORY_RELATION_LOCK_NAMESPACE = 20_261_020
export async function acquireInventoryLock(tx: InventoryTransaction, hostId: string) {
  const result = await tx.$queryRaw<Array<{ acquired: boolean }>>(Prisma.sql`
    SELECT pg_try_advisory_xact_lock(${INVENTORY_RELATION_LOCK_NAMESPACE}::integer, hashtext(${hostId})) AS acquired
  `)
  return result[0]?.acquired === true
}

type Column = readonly [name: string, type: 'text' | 'boolean' | 'jsonb', array?: boolean]
// Identifiers and SQL types are exclusively code-owned; inventory values remain parameters.
const TABLE_COLUMNS = {
  bd_snapshot: [
    ['dn', 'text'],
    ['name', 'text'],
    ['tenant', 'text'],
    ['description', 'text'],
    ['vrf', 'text'],
    ['vrfDn', 'text'],
    ['unicastRoute', 'boolean'],
    ['arpFlood', 'boolean'],
    ['ipLearning', 'boolean'],
    ['limitIpLearnToSubnets', 'boolean'],
    ['unkMacUcastAct', 'text'],
    ['unkMcastAct', 'text'],
    ['multiDstPktAct', 'text'],
    ['subnets', 'jsonb'],
    ['l3Outs', 'jsonb', true],
    ['searchText', 'text'],
  ],
  epg_snapshot: [
    ['dn', 'text'],
    ['name', 'text'],
    ['tenant', 'text'],
    ['appProfile', 'text'],
    ['description', 'text'],
    ['bridgeDomain', 'text'],
    ['bridgeDomainDn', 'text'],
    ['bridgeDomainState', 'text'],
    ['pcTag', 'text'],
    ['preferredGroup', 'boolean'],
    ['isolation', 'boolean'],
    ['domains', 'jsonb', true],
    ['providedContracts', 'jsonb', true],
    ['consumedContracts', 'jsonb', true],
  ],
  epg_path_binding: [
    ['dn', 'text'],
    ['epgId', 'text'],
    ['pathTDn', 'text'],
    ['pod', 'text'],
    ['node', 'text'],
    ['port', 'text'],
    ['pathType', 'text'],
    ['encap', 'text'],
    ['mode', 'text'],
  ],
  bd_epg_relation: [
    ['dn', 'text'],
    ['bdId', 'text'],
    ['epgId', 'text'],
    ['name', 'text'],
    ['tenant', 'text'],
    ['appProfile', 'text'],
  ],
} as const satisfies Record<string, readonly Column[]>
type InventoryTable = keyof typeof TABLE_COLUMNS
const identifier = (name: string) => Prisma.raw(`"${name}"`)

/** Bulk upserts preserve existing IDs and avoid one network round trip per object. */
export async function upsertInventoryRows(
  tx: InventoryTransaction,
  table: InventoryTable,
  hostId: string,
  rows: readonly object[],
) {
  const columns: readonly Column[] = TABLE_COLUMNS[table]
  for (let offset = 0; offset < rows.length; offset += 100) {
    const payload = JSON.stringify(
      rows.slice(offset, offset + 100).map((row) => {
        const record: Record<string, unknown> = { id: randomUUID() }
        for (const [name] of columns) record[name] = (row as Record<string, unknown>)[name]
        return record
      }),
    )
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO ${identifier(table)} (id, "apicHostId", ${Prisma.join(columns.map(([name]) => identifier(name)))})
      SELECT incoming.id, ${hostId}, ${Prisma.join(
        columns.map(([name, , array]) =>
          array
            ? Prisma.sql`ARRAY(SELECT jsonb_array_elements_text(incoming.${identifier(name)}))`
            : Prisma.sql`incoming.${identifier(name)}`,
        ),
      )}
      FROM jsonb_to_recordset(${payload}::jsonb) AS incoming(id text, ${Prisma.join(columns.map(([name, type]) => Prisma.sql`${identifier(name)} ${Prisma.raw(type)}`))})
      ON CONFLICT ("apicHostId", dn) DO UPDATE SET ${Prisma.join(columns.map(([name]) => Prisma.sql`${identifier(name)} = EXCLUDED.${identifier(name)}`))}
    `)
  }
}
export async function pruneInventoryRows(
  tx: InventoryTransaction,
  table: InventoryTable,
  hostId: string,
  dns: readonly string[],
) {
  await tx.$executeRaw(Prisma.sql`
    DELETE FROM ${identifier(table)} WHERE "apicHostId" = ${hostId}
      AND dn NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(dns)}::jsonb))
  `)
}
export async function snapshotIds(
  tx: InventoryTransaction,
  table: 'bd_snapshot' | 'epg_snapshot',
  hostId: string,
) {
  const rows = await tx.$queryRaw<Array<{ id: string; dn: string }>>(Prisma.sql`
    SELECT id, dn FROM ${identifier(table)} WHERE "apicHostId" = ${hostId}
  `)
  return new Map(rows.map((row) => [row.dn, row.id]))
}
export type BdEpgLink = BdEpg & { bdId: string; epgId: string | null }
export async function replaceBdEpgLinks(
  tx: InventoryTransaction,
  hostId: string,
  links: BdEpgLink[],
) {
  const unique = new Map<string, BdEpgLink>()
  for (const link of links) {
    if (unique.has(link.dn) && unique.get(link.dn)!.bdId !== link.bdId)
      throw new Error('An EPG cannot belong to multiple Bridge Domains')
    unique.set(link.dn, link)
  }
  await upsertInventoryRows(tx, 'bd_epg_relation', hostId, [...unique.values()])
  await pruneInventoryRows(tx, 'bd_epg_relation', hostId, [...unique.keys()])
}
