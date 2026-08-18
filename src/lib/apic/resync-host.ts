import { recordAudit } from '@/lib/audit'
import { resyncEndpoints } from '@/lib/apic/endpoints'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import { resyncNodes } from '@/lib/apic/nodes'
import { resyncEpgs } from '@/lib/apic/epg-resync'
import type { DatasetResult, HostResult } from '@/lib/apic/cron-resync'

export interface ResyncHostInput {
  apicHostId: string
  /** Display name, used as the audit target. */
  hostName: string
  /** Reachable address of the APIC. */
  host: string
  username: string
  password: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Resync all four datasets for a single host, auditing each one as `scheduler`.
 * Never throws: every dataset failure is captured in the returned HostResult.
 */
export async function resyncHost(input: ResyncHostInput): Promise<HostResult> {
  const { apicHostId, hostName, host, username, password } = input
  const target = `${hostName} (${host})`
  const creds = { apicHostId, host, username, password }
  const result: HostResult = { apicHostId, host: hostName }

  // Endpoints
  let endpoints: DatasetResult
  try {
    endpoints = await resyncEndpoints(creds)
  } catch (err) {
    endpoints = { error: errorMessage(err, 'Failed to resync endpoints') }
  }
  result.endpoints = endpoints
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.endpoints',
    target,
    status: 'error' in endpoints ? 'failure' : 'success',
    detail: 'error' in endpoints
      ? endpoints.error
      : `synced ${endpoints.synced} (total ${endpoints.total})`,
  })

  // Interfaces
  let interfaces: DatasetResult
  try {
    interfaces = await resyncInterfaces(creds)
  } catch (err) {
    interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
  }
  result.interfaces = interfaces
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.interfaces',
    target,
    status: 'error' in interfaces ? 'failure' : 'success',
    detail: 'error' in interfaces
      ? interfaces.error
      : `synced ${interfaces.synced} (total ${interfaces.total})`,
  })

  // Nodes & hardware
  let nodes: DatasetResult
  try {
    const r = await resyncNodes(creds)
    nodes = { synced: r.syncedNodes, total: r.syncedNodes + r.syncedComponents }
  } catch (err) {
    nodes = { error: errorMessage(err, 'Failed to resync nodes') }
  }
  result.nodes = nodes
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.nodes',
    target,
    status: 'error' in nodes ? 'failure' : 'success',
    detail: 'error' in nodes
      ? nodes.error
      : `synced ${nodes.synced} nodes (total ${nodes.total})`,
  })

  // EPGs & static port bindings
  let epgs: DatasetResult
  try {
    const r = await resyncEpgs(creds)
    epgs = { synced: r.syncedEpgs, total: r.syncedEpgs + r.syncedBindings }
  } catch (err) {
    epgs = { error: errorMessage(err, 'Failed to resync EPGs') }
  }
  result.epgs = epgs
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.epgs',
    target,
    status: 'error' in epgs ? 'failure' : 'success',
    detail: 'error' in epgs
      ? epgs.error
      : `synced ${epgs.synced} EPGs (total ${epgs.total})`,
  })

  return result
}
