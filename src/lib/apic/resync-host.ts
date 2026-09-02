import { recordAudit } from '@/lib/audit'
import { resyncEndpointInventoryForScheduler } from '@/lib/endpoints/mutation'
import { resyncEpgInventoryForScheduler } from '@/lib/epgs/mutation'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import { resyncNodes } from '@/lib/apic/nodes'
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

export interface ResyncHostDependencies {
  resyncEndpointInventoryForScheduler: typeof resyncEndpointInventoryForScheduler
  resyncInterfaces: typeof resyncInterfaces
  resyncNodes: typeof resyncNodes
  resyncEpgInventoryForScheduler: typeof resyncEpgInventoryForScheduler
  recordAudit: typeof recordAudit
}

const DEFAULT_DEPENDENCIES: ResyncHostDependencies = {
  resyncEndpointInventoryForScheduler,
  resyncInterfaces,
  resyncNodes,
  resyncEpgInventoryForScheduler,
  recordAudit,
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Resync all four datasets for a single host, auditing each one as `scheduler`.
 * Never throws: every dataset failure is captured in the returned HostResult.
 */
export async function resyncHost(
  input: ResyncHostInput,
  dependencies: ResyncHostDependencies = DEFAULT_DEPENDENCIES,
): Promise<HostResult> {
  const { apicHostId, hostName, host, username, password } = input
  const {
    resyncEndpointInventoryForScheduler: resyncEndpointInventory,
    resyncInterfaces: resyncInterfaceInventory,
    resyncNodes: resyncNodeInventory,
    resyncEpgInventoryForScheduler: resyncEpgInventory,
    recordAudit: audit,
  } = dependencies
  const target = `${hostName} (${host})`
  const creds = { apicHostId, host, username, password }
  const result: HostResult = { apicHostId, host: hostName }

  // Endpoints
  let endpoints: DatasetResult
  try {
    endpoints = await resyncEndpointInventory({
      ...creds,
      hostName,
    })
  } catch (err) {
    endpoints = { error: errorMessage(err, 'Failed to resync endpoints') }
  }
  result.endpoints = endpoints

  // Interfaces
  let interfaces: DatasetResult
  try {
    interfaces = await resyncInterfaceInventory(creds)
  } catch (err) {
    interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
  }
  result.interfaces = interfaces
  await audit({
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
    const r = await resyncNodeInventory(creds)
    nodes = { synced: r.syncedNodes, total: r.syncedNodes + r.syncedComponents }
  } catch (err) {
    nodes = { error: errorMessage(err, 'Failed to resync nodes') }
  }
  result.nodes = nodes
  await audit({
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
    const r = await resyncEpgInventory({ ...creds, hostName })
    epgs = { synced: r.syncedEpgs, total: r.syncedEpgs + r.syncedBindings }
  } catch (err) {
    epgs = { error: errorMessage(err, 'Failed to resync EPGs') }
  }
  result.epgs = epgs
  return result
}
