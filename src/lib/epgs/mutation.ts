import 'server-only'

import { revalidateTag } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { EpgResyncInProgressError, resyncEpgs } from '@/lib/apic/epg-resync'
import { prisma } from '@/lib/prisma'

export type EpgResyncResult =
  | { ok: true; syncedEpgs: number; syncedBindings: number }
  | { ok: false; code: 'unauthorized' | 'host-not-found' | 'in-progress' | 'sync-failed'; error: string }

export type ScheduledEpgResyncInput = {
  apicHostId: string; hostName: string; host: string; username: string; password: string
}
type ResyncInput = { apicHostId: string; host: string; username: string; password: string }
type AuditInput = {
  userId: string | null; userName: string; action: 'resync.epgs'; target: string
  status?: 'success' | 'failure'; detail: string
}
export type EpgMutationDependencies = {
  requireSession: () => Promise<{ id: string; userName: string }>
  findHost: (id: string) => Promise<{ id: string; name: string; host: string } | null>
  resyncEpgs: (input: ResyncInput) => Promise<{ syncedEpgs: number; syncedBindings: number }>
  recordAudit: (input: AuditInput) => Promise<void>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  isInProgressError: (error: unknown) => boolean
  reportAuditError?: (error: unknown) => void
}

type ResolvedInput = ScheduledEpgResyncInput & { actor: { kind: 'user'; id: string; userName: string } | { kind: 'scheduler' } }
class EpgSyncFailure extends Error { constructor(readonly reason: unknown) { super('EPG sync failed') } }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Failed to resync EPGs' }

export function createEpgMutation(dependencies: EpgMutationDependencies) {
  function invalidateEpgReads(hostId: string) {
    dependencies.revalidateTag('epgs:all', { expire: 0 })
    dependencies.revalidateTag(`epgs:host:${hostId}`, { expire: 0 })
  }
  async function audit(input: AuditInput) {
    try { await dependencies.recordAudit(input) } catch (error) { dependencies.reportAuditError?.(error) }
  }
  async function execute(input: ResolvedInput) {
    const { actor } = input; const target = `${input.hostName} (${input.host})`
    let result: { syncedEpgs: number; syncedBindings: number }
    try {
      result = await dependencies.resyncEpgs({ apicHostId: input.apicHostId, host: input.host, username: input.username.trim(), password: input.password })
    } catch (error) {
      if (actor.kind === 'scheduler') {
        await audit({ userId: null, userName: 'scheduler', action: 'resync.epgs', target, status: 'failure', detail: message(error) })
        throw error
      }
      throw new EpgSyncFailure(error)
    }
    await audit({
      userId: actor.kind === 'user' ? actor.id : null,
      userName: actor.kind === 'user' ? actor.userName : 'scheduler',
      action: 'resync.epgs', target,
      ...(actor.kind === 'scheduler' ? { status: 'success' as const } : {}),
      detail: `synced ${result.syncedEpgs} EPGs (${result.syncedBindings} bindings)`,
    })
    invalidateEpgReads(input.apicHostId)
    return result
  }
  async function resyncEpgInventory(input: { apicHostId: string; username: string; password: string }): Promise<EpgResyncResult> {
    let actor: { id: string; userName: string }
    try { actor = await dependencies.requireSession() } catch { return { ok: false, code: 'unauthorized', error: 'Unauthorized' } }
    const host = await dependencies.findHost(input.apicHostId)
    if (!host) return { ok: false, code: 'host-not-found', error: 'Host not found' }
    try {
      return { ok: true, ...await execute({ ...input, hostName: host.name, host: host.host, actor: { kind: 'user', ...actor } }) }
    } catch (error) {
      if (!(error instanceof EpgSyncFailure)) throw error
      if (dependencies.isInProgressError(error.reason)) return { ok: false, code: 'in-progress', error: 'EPG resync is already in progress' }
      return { ok: false, code: 'sync-failed', error: 'Failed to resync EPGs' }
    }
  }
  async function resyncEpgInventoryForScheduler(input: ScheduledEpgResyncInput) {
    return execute({ ...input, actor: { kind: 'scheduler' } })
  }
  return { invalidateEpgReads, resyncEpgInventory, resyncEpgInventoryForScheduler }
}

const mutation = createEpgMutation({
  requireSession,
  findHost: id => prisma.apicHost.findFirst({ where: { id }, select: { id: true, name: true, host: true } }),
  resyncEpgs, recordAudit, revalidateTag,
  isInProgressError: error => error instanceof EpgResyncInProgressError,
  reportAuditError: error => console.error('[epgs] failed to record resync audit', error),
})
export const { invalidateEpgReads, resyncEpgInventory, resyncEpgInventoryForScheduler } = mutation
