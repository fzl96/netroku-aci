import { prisma } from '@/lib/prisma'
import { fetchEpgInventoryFromApic, type EpgRow } from './epg-inventory'

const EPG_CHUNK_SIZE = 100
const EPG_TRANSACTION_TIMEOUT_MS = 30_000
// Distinct from the endpoints lock namespace (20_260_619) so EPG and endpoint
// resyncs for the same host don't contend with each other.
const EPG_ADVISORY_LOCK_NAMESPACE = 20_260_713

/** Thrown when an EPG resync is requested for a host that already has one running. */
export class EpgResyncInProgressError extends Error {
  constructor(apicHostId: string) {
    super(`An EPG resync is already in progress for host ${apicHostId}`)
    this.name = 'EpgResyncInProgressError'
  }
}

type EpgSnapshotDelegate = Pick<typeof prisma.epgSnapshot, 'upsert' | 'updateMany'>
type EpgPathBindingDelegate = Pick<typeof prisma.epgPathBinding, 'upsert' | 'updateMany'>
type ApicHostDelegate = Pick<typeof prisma.apicHost, 'update'>

interface EpgMutationClient {
  epgSnapshot: EpgSnapshotDelegate
  epgPathBinding: EpgPathBindingDelegate
  apicHost: ApicHostDelegate
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

export interface EpgWriteClient {
  $transaction<T>(
    fn: (tx: EpgMutationClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}

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

/**
 * Fetch EPG inventory (with static port bindings) from APIC and persist it for
 * one host. Upserts EpgSnapshot then EpgPathBinding by (apicHostId, dn) and
 * flips departed rows to present: false — rows are never deleted. Serialized
 * per host via a Postgres advisory transaction lock.
 */
export async function resyncEpgs(args: ResyncEpgsArgs): Promise<ResyncEpgsResult> {
  const { apicHostId, host, username, password } = args

  const fetched = await fetchEpgInventoryFromApic(host, username, password)

  // Deduplicate by dn (defensive — the class query should already be unique).
  const byDn = new Map<string, EpgRow>()
  for (const epg of fetched) byDn.set(epg.dn, epg)
  const uniqueEpgs = Array.from(byDn.values())

  return executeEpgResyncWrites(prisma, apicHostId, uniqueEpgs, new Date())
}

async function tryAcquireEpgResyncAdvisoryLock(
  tx: Pick<EpgMutationClient, '$queryRaw'>,
  apicHostId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(${EPG_ADVISORY_LOCK_NAMESPACE}::integer, hashtext(${apicHostId})) AS acquired
  `
  return rows[0]?.acquired === true
}

/**
 * Persist the fetched EPGs and their bindings for one host in a single locked
 * transaction. Callers must pass EPGs already deduplicated by `dn` (as
 * `resyncEpgs` does) — the parent-id map assumes one row per dn.
 */
export async function executeEpgResyncWrites(
  db: EpgWriteClient,
  apicHostId: string,
  epgs: EpgRow[],
  now: Date,
): Promise<ResyncEpgsResult> {
  return db.$transaction(async tx => {
    const acquired = await tryAcquireEpgResyncAdvisoryLock(tx, apicHostId)
    if (!acquired) throw new EpgResyncInProgressError(apicHostId)

    // Upsert EPGs first — bindings need the parent row ids.
    const idByDn = new Map<string, string>()
    for (let i = 0; i < epgs.length; i += EPG_CHUNK_SIZE) {
      const chunk = epgs.slice(i, i + EPG_CHUNK_SIZE)
      const upserted = await Promise.all(
        chunk.map(e =>
          tx.epgSnapshot.upsert({
            where: { apicHostId_dn: { apicHostId, dn: e.dn } },
            update: {
              name: e.name, tenant: e.tenant, appProfile: e.appProfile,
              description: e.description, bridgeDomain: e.bridgeDomain,
              pcTag: e.pcTag, preferredGroup: e.preferredGroup,
              isolation: e.isolation, domains: e.domains,
              providedContracts: e.providedContracts,
              consumedContracts: e.consumedContracts,
              present: true, lastSeenAt: now,
            },
            create: {
              apicHostId, dn: e.dn, name: e.name, tenant: e.tenant,
              appProfile: e.appProfile, description: e.description,
              bridgeDomain: e.bridgeDomain, pcTag: e.pcTag,
              preferredGroup: e.preferredGroup, isolation: e.isolation,
              domains: e.domains, providedContracts: e.providedContracts,
              consumedContracts: e.consumedContracts,
              present: true, firstSeenAt: now, lastSeenAt: now,
            },
          }),
        ),
      )
      chunk.forEach((e, j) => idByDn.set(e.dn, upserted[j].id))
    }
    await tx.epgSnapshot.updateMany({
      where: { apicHostId, present: true, dn: { notIn: epgs.map(e => e.dn) } },
      data: { present: false },
    })

    // Bindings, deduped by dn across all EPGs.
    const bindingByDn = new Map<string, { epgDn: string; binding: EpgRow['bindings'][number] }>()
    for (const e of epgs) {
      for (const b of e.bindings) bindingByDn.set(b.dn, { epgDn: e.dn, binding: b })
    }
    const uniqueBindings = Array.from(bindingByDn.values())

    for (let i = 0; i < uniqueBindings.length; i += EPG_CHUNK_SIZE) {
      const chunk = uniqueBindings.slice(i, i + EPG_CHUNK_SIZE)
      await Promise.all(
        chunk.map(({ epgDn, binding: b }) => {
          const epgId = idByDn.get(epgDn)!
          return tx.epgPathBinding.upsert({
            where: { apicHostId_dn: { apicHostId, dn: b.dn } },
            update: {
              epgId, pathTDn: b.pathTDn, pod: b.pod, node: b.node,
              port: b.port, pathType: b.pathType, encap: b.encap,
              mode: b.mode, present: true, lastSeenAt: now,
            },
            create: {
              apicHostId, epgId, dn: b.dn, pathTDn: b.pathTDn, pod: b.pod,
              node: b.node, port: b.port, pathType: b.pathType,
              encap: b.encap, mode: b.mode,
              present: true, firstSeenAt: now, lastSeenAt: now,
            },
          })
        }),
      )
    }
    await tx.epgPathBinding.updateMany({
      where: { apicHostId, present: true, dn: { notIn: uniqueBindings.map(u => u.binding.dn) } },
      data: { present: false },
    })

    await tx.apicHost.update({
      where: { id: apicHostId },
      data: { lastEpgSyncAt: now },
    })

    return { syncedEpgs: epgs.length, syncedBindings: uniqueBindings.length }
  }, { timeout: EPG_TRANSACTION_TIMEOUT_MS })
}
