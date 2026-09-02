import 'server-only'

import { revalidateTag } from 'next/cache'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import { recordAudit } from '@/lib/audit'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type InterfaceResyncResult =
  | { ok: true; synced: number; total: number }
  | { ok: false; code: 'unauthorized' | 'host-not-found' | 'sync-failed'; error: string }
export type ScheduledInterfaceResyncInput = {
  apicHostId: string; hostName: string; host: string; username: string; password: string
}
type SyncInput = { apicHostId: string; host: string; username: string; password: string }
type SyncResult = { synced: number; total: number }
type AuditInput = Parameters<typeof recordAudit>[0]
export type InterfaceMutationDependencies = {
  requireSession: () => Promise<{ id: string; userName: string }>
  findHost: (id: string) => Promise<{ id: string; name: string; host: string } | null>
  resyncInterfaces: (input: SyncInput) => Promise<SyncResult>
  recordAudit: (input: AuditInput) => Promise<void>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  isAuthenticationRequiredError: (error: unknown) => boolean
  reportAuditError?: (error: unknown) => void
}
type Actor = { kind: 'user'; id: string; userName: string } | { kind: 'scheduler' }
type ResolvedInput = ScheduledInterfaceResyncInput & { actor: Actor }
class InterfaceSyncFailure extends Error {
  constructor(readonly reason: unknown) { super('Interface sync failed') }
}
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to resync interfaces'
}

export function createInterfaceMutation(dependencies: InterfaceMutationDependencies) {
  function invalidateInterfaceReads(hostId: string) {
    dependencies.revalidateTag('interfaces:all', { expire: 0 })
    dependencies.revalidateTag(`interfaces:host:${hostId}`, { expire: 0 })
  }
  async function audit(input: AuditInput) {
    try { await dependencies.recordAudit(input) }
    catch (error) { dependencies.reportAuditError?.(error) }
  }
  async function execute(input: ResolvedInput): Promise<SyncResult> {
    const target = `${input.hostName} (${input.host})`
    let result: SyncResult
    try {
      result = await dependencies.resyncInterfaces({
        apicHostId: input.apicHostId, host: input.host,
        username: input.username.trim(), password: input.password,
      })
    } catch (error) {
      if (input.actor.kind === 'scheduler') {
        await audit({ userId: null, userName: 'scheduler', action: 'resync.interfaces', target, status: 'failure', detail: message(error) })
        throw error
      }
      throw new InterfaceSyncFailure(error)
    }
    await audit({
      userId: input.actor.kind === 'user' ? input.actor.id : null,
      userName: input.actor.kind === 'user' ? input.actor.userName : 'scheduler',
      action: 'resync.interfaces', target,
      ...(input.actor.kind === 'scheduler' ? { status: 'success' as const } : {}),
      detail: `synced ${result.synced} (total ${result.total})`,
    })
    invalidateInterfaceReads(input.apicHostId)
    return result
  }
  async function resyncInterfaceInventory(
    input: { apicHostId: string; username: string; password: string },
  ): Promise<InterfaceResyncResult> {
    let actor: { id: string; userName: string }
    try { actor = await dependencies.requireSession() }
    catch (error) {
      if (!dependencies.isAuthenticationRequiredError(error)) throw error
      return { ok: false, code: 'unauthorized', error: 'Unauthorized' }
    }
    const host = await dependencies.findHost(input.apicHostId)
    if (!host) return { ok: false, code: 'host-not-found', error: 'Host not found' }
    try {
      return {
        ok: true,
        ...await execute({
          ...input, hostName: host.name, host: host.host, actor: { kind: 'user', ...actor },
        }),
      }
    } catch (error) {
      if (!(error instanceof InterfaceSyncFailure)) throw error
      return { ok: false, code: 'sync-failed', error: 'Failed to resync interfaces' }
    }
  }
  async function resyncInterfaceInventoryForScheduler(input: ScheduledInterfaceResyncInput) {
    return execute({ ...input, actor: { kind: 'scheduler' } })
  }
  return {
    invalidateInterfaceReads,
    resyncInterfaceInventory,
    resyncInterfaceInventoryForScheduler,
  }
}

const mutation = createInterfaceMutation({
  requireSession,
  findHost: id => prisma.apicHost.findFirst({
    where: { id }, select: { id: true, name: true, host: true },
  }),
  resyncInterfaces, recordAudit, revalidateTag,
  isAuthenticationRequiredError: error => error instanceof AuthenticationRequiredError,
  reportAuditError: error => console.error('[interface-health] failed to record resync audit', error),
})
export const {
  invalidateInterfaceReads,
  resyncInterfaceInventory,
  resyncInterfaceInventoryForScheduler,
} = mutation
