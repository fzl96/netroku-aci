import { prisma } from '@/lib/prisma'
import { fetchEpgInventoryFromApic, type EpgRow } from './epg-inventory'

const EPG_CHUNK_SIZE = 100
const EPG_TRANSACTION_TIMEOUT_MS = 120_000
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

type EpgSnapshotDelegate = Pick<typeof prisma.epgSnapshot, 'deleteMany' | 'createMany' | 'findMany'>
type EpgPathBindingDelegate = Pick<typeof prisma.epgPathBinding, 'deleteMany' | 'createMany'>
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
 * Fetch EPG inventory (with static port bindings) from APIC and persist the latest state for
 * one host. Replaces existing EpgSnapshot and EpgPathBinding records in a single bulk transaction.
 * Serialized per host via a Postgres advisory transaction lock.
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
 * Persist the fetched EPGs and their bindings for one host in a single locked transaction,
 * replacing previous state with current snapshot. Callers must pass EPGs deduplicated by `dn`.
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

    // Purge previous state for this host
    await tx.epgPathBinding.deleteMany({ where: { apicHostId } })
    await tx.epgSnapshot.deleteMany({ where: { apicHostId } })

    // Bulk insert EPG snapshots
    if (epgs.length > 0) {
      await tx.epgSnapshot.createMany({
        data: epgs.map(e => ({
          apicHostId,
          dn: e.dn,
          name: e.name,
          tenant: e.tenant,
          appProfile: e.appProfile,
          description: e.description,
          bridgeDomain: e.bridgeDomain,
          pcTag: e.pcTag,
          preferredGroup: e.preferredGroup,
          isolation: e.isolation,
          domains: e.domains,
          providedContracts: e.providedContracts,
          consumedContracts: e.consumedContracts,
        })),
      })
    }

    const createdEpgs = epgs.length > 0
      ? await tx.epgSnapshot.findMany({
          where: { apicHostId },
          select: { id: true, dn: true },
        })
      : []
    const idByDn = new Map<string, string>()
    for (const e of createdEpgs) idByDn.set(e.dn, e.id)

    // Collect and deduplicate bindings by dn
    const bindingByDn = new Map<string, { epgDn: string; binding: EpgRow['bindings'][number] }>()
    for (const e of epgs) {
      for (const b of e.bindings) bindingByDn.set(b.dn, { epgDn: e.dn, binding: b })
    }
    const uniqueBindings = Array.from(bindingByDn.values())

    if (uniqueBindings.length > 0) {
      await tx.epgPathBinding.createMany({
        data: uniqueBindings.map(({ epgDn, binding: b }) => ({
          apicHostId,
          epgId: idByDn.get(epgDn)!,
          dn: b.dn,
          pathTDn: b.pathTDn,
          pod: b.pod,
          node: b.node,
          port: b.port,
          pathType: b.pathType,
          encap: b.encap,
          mode: b.mode,
        })),
      })
    }

    await tx.apicHost.update({
      where: { id: apicHostId },
      data: { lastEpgSyncAt: now },
    })

    return { syncedEpgs: epgs.length, syncedBindings: uniqueBindings.length }
  }, { timeout: EPG_TRANSACTION_TIMEOUT_MS })
}
