import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { fetchBdInventoryFromApic } from './bd-inventory'
import { bdSearchText, type BdInventoryRow } from '@/lib/bds/types'
import {
  acquireInventoryLock,
  upsertInventoryRows,
  pruneInventoryRows,
  snapshotIds,
  replaceBdEpgLinks,
  type InventoryWriteClient,
} from './inventory-relations'

export class BdResyncInProgressError extends Error {
  constructor(hostId: string) {
    super(`A BD or EPG inventory refresh is already in progress for host ${hostId}`)
    this.name = 'BdResyncInProgressError'
  }
}
export type BdWriteClient = InventoryWriteClient
export async function executeBdResyncWrites(
  db: BdWriteClient,
  apicHostId: string,
  rows: BdInventoryRow[],
  now: Date,
) {
  return db.$transaction(
    async (tx) => {
      if (!(await acquireInventoryLock(tx, apicHostId)))
        throw new BdResyncInProgressError(apicHostId)
      const unique = [...new Map(rows.map((row) => [row.dn, row])).values()]
      await upsertInventoryRows(
        tx,
        'bd_snapshot',
        apicHostId,
        unique.map((row) => ({ ...row, searchText: bdSearchText(row) })),
      )
      await pruneInventoryRows(
        tx,
        'bd_snapshot',
        apicHostId,
        unique.map((row) => row.dn),
      )
      const bdIds = await snapshotIds(tx, 'bd_snapshot', apicHostId)
      const epgIds = await snapshotIds(tx, 'epg_snapshot', apicHostId)
      await replaceBdEpgLinks(
        tx,
        apicHostId,
        unique.flatMap((bd) =>
          bd.epgs.map((epg) => ({
            ...epg,
            bdId: bdIds.get(bd.dn)!,
            epgId: epgIds.get(epg.dn) ?? null,
          })),
        ),
      )
      await tx.$executeRaw(
        Prisma.sql`UPDATE apic_host SET "lastBdSyncAt" = ${now}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${apicHostId}`,
      )
      return { syncedBds: unique.length }
    },
    { timeout: 120_000 },
  )
}
export async function resyncBds(input: {
  apicHostId: string
  host: string
  username: string
  password: string
}) {
  const rows = await fetchBdInventoryFromApic(input.host, input.username, input.password)
  return executeBdResyncWrites(prisma, input.apicHostId, rows, new Date())
}
