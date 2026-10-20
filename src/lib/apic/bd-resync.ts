import { prisma } from '@/lib/prisma'
import { fetchBdInventoryFromApic } from './bd-inventory'
import { bdSearchText, type BdInventoryRow } from '@/lib/bds/types'

const BD_ADVISORY_LOCK_NAMESPACE = 20_261_020
export class BdResyncInProgressError extends Error {
  constructor(hostId: string) {
    super(`A Bridge Domain resync is already in progress for host ${hostId}`)
    this.name = 'BdResyncInProgressError'
  }
}
interface BdMutationClient {
  bdSnapshot: Pick<typeof prisma.bdSnapshot, 'deleteMany' | 'createMany'>
  apicHost: Pick<typeof prisma.apicHost, 'update'>
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}
export interface BdWriteClient {
  $transaction<T>(
    fn: (tx: BdMutationClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}
export async function executeBdResyncWrites(
  db: BdWriteClient,
  apicHostId: string,
  rows: BdInventoryRow[],
  now: Date,
) {
  return db.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<Array<{ acquired: boolean }>>`
      SELECT pg_try_advisory_xact_lock(${BD_ADVISORY_LOCK_NAMESPACE}::integer, hashtext(${apicHostId})) AS acquired
    `
      if (!lock[0]?.acquired) throw new BdResyncInProgressError(apicHostId)
      const unique = [...new Map(rows.map((row) => [row.dn, row])).values()]
      await tx.bdSnapshot.deleteMany({ where: { apicHostId } })
      for (let start = 0; start < unique.length; start += 100) {
        await tx.bdSnapshot.createMany({
          data: unique.slice(start, start + 100).map((row) => ({
            ...row,
            apicHostId,
            epgCount: row.epgs.length,
            searchText: bdSearchText(row),
          })),
        })
      }
      await tx.apicHost.update({ where: { id: apicHostId }, data: { lastBdSyncAt: now } })
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
