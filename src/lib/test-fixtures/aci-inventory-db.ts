import { readFileSync } from 'node:fs'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { Prisma } from '@prisma/client'
import type { InventoryTransaction, InventoryWriteClient } from '@/lib/apic/inventory-relations'

export const RELATION_MIGRATION =
  'prisma/migrations/20261020010000_relate_bd_epg_inventory/migration.sql'
export async function createInventoryTestDb(relations = true) {
  const db = new PGlite()
  await db.exec(
    'CREATE TABLE apic_host (id TEXT PRIMARY KEY, "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  )
  for (const migration of [
    '20260713164416_add_epg_inventory',
    '20260714055500_drop_epg_historical_fields',
    '20261020000000_add_bd_inventory',
  ])
    await db.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'))
  await db.exec("INSERT INTO apic_host (id) VALUES ('h1'), ('h2')")
  if (relations) await db.exec(readFileSync(RELATION_MIGRATION, 'utf8'))
  return db
}

// Run the production parameterized SQL against PostgreSQL semantics, including
// real transactions/FKs. Only lock contention is injected for busy-host tests.
export function inventoryTestWriter(
  db: PGlite,
  options: { busy?: boolean; failTimestamp?: boolean } = {},
): InventoryWriteClient {
  return {
    $transaction: (fn) =>
      db.transaction(async (tx: Transaction) => {
        const client: InventoryTransaction = {
          $executeRaw: async (query: Prisma.Sql) => {
            if (options.failTimestamp && query.text.includes('UPDATE apic_host'))
              throw new Error('Timestamp write failed')
            return (await tx.query(query.text, query.values)).affectedRows ?? 0
          },
          $queryRaw: async <T>(query: Prisma.Sql): Promise<T> => {
            if (options.busy && query.text.includes('pg_try_advisory_xact_lock'))
              return [{ acquired: false }] as T
            return (await tx.query(query.text, query.values)).rows as T
          },
        }
        return fn(client)
      }),
  }
}
