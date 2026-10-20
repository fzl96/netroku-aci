import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { fetchEpgInventoryFromApic, type EpgRow } from './epg-inventory'
import {
  acquireInventoryLock,
  upsertInventoryRows,
  pruneInventoryRows,
  snapshotIds,
  replaceBdEpgLinks,
  type InventoryWriteClient,
  type BdEpgLink,
} from './inventory-relations'

export class EpgResyncInProgressError extends Error {
  constructor(hostId: string) {
    super(`A BD or EPG inventory refresh is already in progress for host ${hostId}`)
    this.name = 'EpgResyncInProgressError'
  }
}
export type EpgWriteClient = InventoryWriteClient
export interface ResyncEpgsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}
export interface ResyncEpgsResult {
  syncedEpgs: number
  syncedBindings: number
}
export async function resyncEpgs(args: ResyncEpgsArgs): Promise<ResyncEpgsResult> {
  const fetched = await fetchEpgInventoryFromApic(args.host, args.username, args.password)
  return executeEpgResyncWrites(prisma, args.apicHostId, fetched, new Date())
}

/** Update snapshots in place and reconcile memberships under the shared per-host lock. */
export async function executeEpgResyncWrites(
  db: EpgWriteClient,
  apicHostId: string,
  rows: EpgRow[],
  now: Date,
): Promise<ResyncEpgsResult> {
  return db.$transaction(
    async (tx) => {
      if (!(await acquireInventoryLock(tx, apicHostId)))
        throw new EpgResyncInProgressError(apicHostId)
      const epgs = [...new Map(rows.map((row) => [row.dn, row])).values()]
      await upsertInventoryRows(
        tx,
        'epg_snapshot',
        apicHostId,
        epgs.map((epg) => ({
          ...epg,
          bridgeDomainDn: epg.bridgeDomainDn ?? '',
          bridgeDomainState: epg.bridgeDomainState ?? '',
        })),
      )
      const epgIds = await snapshotIds(tx, 'epg_snapshot', apicHostId)
      const bdIds = await snapshotIds(tx, 'bd_snapshot', apicHostId)
      const links: BdEpgLink[] = []
      for (const epg of epgs) {
        if (epg.bridgeDomainState === 'unformed' || (!epg.bridgeDomain && !epg.bridgeDomainDn))
          continue
        const localDn = `uni/tn-${epg.tenant}/BD-${epg.bridgeDomain}`
        const bdDn =
          epg.bridgeDomainDn ||
          (bdIds.has(localDn) ? localDn : `uni/tn-common/BD-${epg.bridgeDomain}`)
        const bdId = bdIds.get(bdDn)
        if (bdId)
          links.push({
            dn: epg.dn,
            name: epg.name,
            tenant: epg.tenant,
            appProfile: epg.appProfile,
            bdId,
            epgId: epgIds.get(epg.dn)!,
          })
      }
      // Clear obsolete references before deleting missing EPGs; the FK forbids dangling IDs.
      await replaceBdEpgLinks(tx, apicHostId, links)
      await pruneInventoryRows(
        tx,
        'epg_snapshot',
        apicHostId,
        epgs.map((epg) => epg.dn),
      )
      const byDn = new Map<string, EpgRow['bindings'][number] & { epgId: string }>()
      for (const epg of epgs)
        for (const binding of epg.bindings)
          byDn.set(binding.dn, { ...binding, epgId: epgIds.get(epg.dn)! })
      const bindings = [...byDn.values()]
      await upsertInventoryRows(tx, 'epg_path_binding', apicHostId, bindings)
      await pruneInventoryRows(
        tx,
        'epg_path_binding',
        apicHostId,
        bindings.map((binding) => binding.dn),
      )
      await tx.$executeRaw(
        Prisma.sql`UPDATE apic_host SET "lastEpgSyncAt" = ${now}, "updatedAt" = CURRENT_TIMESTAMP WHERE id = ${apicHostId}`,
      )
      return { syncedEpgs: epgs.length, syncedBindings: bindings.length }
    },
    { timeout: 120_000 },
  )
}
