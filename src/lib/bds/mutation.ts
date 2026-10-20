import 'server-only'

import { revalidateTag } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { BdResyncInProgressError, resyncBds } from '@/lib/apic/bd-resync'
import { prisma } from '@/lib/prisma'

export type BdResyncResult =
  | { ok: true; syncedBds: number }
  | {
      ok: false
      code: 'unauthorized' | 'host-not-found' | 'in-progress' | 'sync-failed'
      error: string
    }

export type ScheduledBdResyncInput = {
  apicHostId: string
  hostName: string
  host: string
  username: string
  password: string
}
type ResyncInput = { apicHostId: string; host: string; username: string; password: string }
type AuditInput = {
  userId: string | null
  userName: string
  action: 'resync.bds'
  target: string
  status?: 'success' | 'failure'
  detail: string
}
export type BdMutationDependencies = {
  requireSession: () => Promise<{ id: string; userName: string }>
  findHost: (id: string) => Promise<{ id: string; name: string; host: string } | null>
  resyncBds: (input: ResyncInput) => Promise<{ syncedBds: number }>
  recordAudit: (input: AuditInput) => Promise<void>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  isInProgressError: (error: unknown) => boolean
  isAuthenticationRequiredError: (error: unknown) => boolean
  reportAuditError?: (error: unknown) => void
}

type ResolvedInput = ScheduledBdResyncInput & {
  actor: { kind: 'user'; id: string; userName: string } | { kind: 'scheduler' }
}
class BdSyncFailure extends Error {
  constructor(readonly reason: unknown) {
    super('Bridge Domain sync failed')
  }
}

export function createBdMutation(dependencies: BdMutationDependencies) {
  function invalidateBdReads(hostId: string) {
    dependencies.revalidateTag('bds:all', { expire: 0 })
    dependencies.revalidateTag(`bds:host:${hostId}`, { expire: 0 })
    dependencies.revalidateTag('epgs:all', { expire: 0 })
    dependencies.revalidateTag(`epgs:host:${hostId}`, { expire: 0 })
  }
  async function audit(input: AuditInput) {
    try {
      await dependencies.recordAudit(input)
    } catch (error) {
      dependencies.reportAuditError?.(error)
    }
  }
  async function execute(input: ResolvedInput) {
    const { actor } = input
    const target = `${input.hostName} (${input.host})`
    let result: { syncedBds: number }
    try {
      result = await dependencies.resyncBds({
        apicHostId: input.apicHostId,
        host: input.host,
        username: input.username.trim(),
        password: input.password,
      })
    } catch (error) {
      if (actor.kind === 'scheduler') throw error
      throw new BdSyncFailure(error)
    }
    if (actor.kind === 'user') {
      await audit({
        userId: actor.id,
        userName: actor.userName,
        action: 'resync.bds',
        target,
        detail: `synced ${result.syncedBds} Bridge Domains`,
      })
    }
    invalidateBdReads(input.apicHostId)
    return result
  }
  async function resyncBdInventory(input: {
    apicHostId: string
    username: string
    password: string
  }): Promise<BdResyncResult> {
    let actor: { id: string; userName: string }
    try {
      actor = await dependencies.requireSession()
    } catch (error) {
      if (!dependencies.isAuthenticationRequiredError(error)) throw error
      return { ok: false, code: 'unauthorized', error: 'Unauthorized' }
    }
    const host = await dependencies.findHost(input.apicHostId)
    if (!host) return { ok: false, code: 'host-not-found', error: 'Host not found' }
    try {
      return {
        ok: true,
        ...(await execute({
          ...input,
          hostName: host.name,
          host: host.host,
          actor: { kind: 'user', ...actor },
        })),
      }
    } catch (error) {
      if (!(error instanceof BdSyncFailure)) throw error
      if (dependencies.isInProgressError(error.reason))
        return {
          ok: false,
          code: 'in-progress',
          error: 'Bridge Domain resync is already in progress',
        }
      return { ok: false, code: 'sync-failed', error: 'Failed to resync Bridge Domains' }
    }
  }
  async function resyncBdInventoryForScheduler(input: ScheduledBdResyncInput) {
    return execute({ ...input, actor: { kind: 'scheduler' } })
  }
  return { invalidateBdReads, resyncBdInventory, resyncBdInventoryForScheduler }
}

const mutation = createBdMutation({
  requireSession,
  findHost: (id) =>
    prisma.apicHost.findFirst({ where: { id }, select: { id: true, name: true, host: true } }),
  resyncBds,
  recordAudit,
  revalidateTag,
  isInProgressError: (error) => error instanceof BdResyncInProgressError,
  isAuthenticationRequiredError: (error) => error instanceof AuthenticationRequiredError,
  reportAuditError: (error) => console.error('[bds] failed to record resync audit', error),
})
export const { invalidateBdReads, resyncBdInventory, resyncBdInventoryForScheduler } = mutation
