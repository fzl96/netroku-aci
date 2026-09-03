import 'server-only'

import { revalidateTag } from 'next/cache'
import { recordAudit } from '@/lib/audit'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { resyncNodes } from '@/lib/apic/nodes'
import { prisma } from '@/lib/prisma'

export type NodeResyncResult =
  | { ok: true; syncedNodes: number; syncedComponents: number; nodesOnline: number }
  | { ok: false; code: 'unauthorized' | 'host-not-found' | 'sync-failed'; error: string }
export type ScheduledNodeResyncInput = {
  apicHostId: string; hostName: string; host: string; username: string; password: string
}
type SyncInput = { apicHostId: string; host: string; username: string; password: string }
type SyncResult = { syncedNodes: number; syncedComponents: number; nodesOnline: number }
type AuditInput = Parameters<typeof recordAudit>[0]
export type NodeMutationDependencies = {
  requireSession: () => Promise<{ id: string; userName: string }>
  findHost: (id: string) => Promise<{ id: string; name: string; host: string } | null>
  resyncNodes: (input: SyncInput) => Promise<SyncResult>
  recordAudit: (input: AuditInput) => Promise<void>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  isAuthenticationRequiredError: (error: unknown) => boolean
  reportAuditError?: (error: unknown) => void
}
type Actor = { kind: 'user'; id: string; userName: string } | { kind: 'scheduler' }
type ResolvedInput = ScheduledNodeResyncInput & { actor: Actor }
class NodeSyncFailure extends Error { constructor(readonly reason: unknown) { super('Node sync failed') } }
function message(error: unknown): string { return error instanceof Error ? error.message : 'Failed to resync nodes' }

export function createNodeMutation(dependencies: NodeMutationDependencies) {
  function invalidateNodeReads(hostId: string) {
    dependencies.revalidateTag('nodes:all', { expire: 0 })
    dependencies.revalidateTag(`nodes:host:${hostId}`, { expire: 0 })
  }
  async function audit(input: AuditInput) {
    try { await dependencies.recordAudit(input) }
    catch (error) { dependencies.reportAuditError?.(error) }
  }
  async function execute(input: ResolvedInput): Promise<SyncResult> {
    const target = `${input.hostName} (${input.host})`
    let result: SyncResult
    try {
      result = await dependencies.resyncNodes({
        apicHostId: input.apicHostId, host: input.host,
        username: input.username.trim(), password: input.password,
      })
    } catch (error) {
      if (input.actor.kind === 'scheduler') {
        await audit({ userId: null, userName: 'scheduler', action: 'resync.nodes', target, status: 'failure', detail: message(error) })
        throw error
      }
      throw new NodeSyncFailure(error)
    }
    await audit({
      userId: input.actor.kind === 'user' ? input.actor.id : null,
      userName: input.actor.kind === 'user' ? input.actor.userName : 'scheduler',
      action: 'resync.nodes', target,
      ...(input.actor.kind === 'scheduler' ? { status: 'success' as const } : {}),
      detail: `synced ${result.syncedNodes} nodes, ${result.syncedComponents} components`,
    })
    invalidateNodeReads(input.apicHostId)
    return result
  }
  async function resyncNodeInventory(input: { apicHostId: string; username: string; password: string }): Promise<NodeResyncResult> {
    let actor: { id: string; userName: string }
    try { actor = await dependencies.requireSession() }
    catch (error) {
      if (!dependencies.isAuthenticationRequiredError(error)) throw error
      return { ok: false, code: 'unauthorized', error: 'Unauthorized' }
    }
    const host = await dependencies.findHost(input.apicHostId)
    if (!host) return { ok: false, code: 'host-not-found', error: 'Host not found' }
    try {
      return { ok: true, ...await execute({ ...input, hostName: host.name, host: host.host, actor: { kind: 'user', ...actor } }) }
    } catch (error) {
      if (!(error instanceof NodeSyncFailure)) throw error
      return { ok: false, code: 'sync-failed', error: 'Failed to resync nodes' }
    }
  }
  async function resyncNodeInventoryForScheduler(input: ScheduledNodeResyncInput) {
    return execute({ ...input, actor: { kind: 'scheduler' } })
  }
  return { invalidateNodeReads, resyncNodeInventory, resyncNodeInventoryForScheduler }
}

const mutation = createNodeMutation({
  requireSession,
  findHost: id => prisma.apicHost.findFirst({ where: { id }, select: { id: true, name: true, host: true } }),
  resyncNodes, recordAudit, revalidateTag,
  isAuthenticationRequiredError: error => error instanceof AuthenticationRequiredError,
  reportAuditError: error => console.error('[nodes] failed to record resync audit', error),
})
export const { invalidateNodeReads, resyncNodeInventory, resyncNodeInventoryForScheduler } = mutation
