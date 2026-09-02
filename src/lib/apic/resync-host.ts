import { resyncEndpointInventoryForScheduler } from '@/lib/endpoints/mutation'
import { resyncEpgInventoryForScheduler } from '@/lib/epgs/mutation'
import { resyncNodeInventoryForScheduler } from '@/lib/nodes/mutation'
import { resyncInterfaceInventoryForScheduler } from '@/lib/interface-health/mutation'
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
  resyncInterfaceInventoryForScheduler: typeof resyncInterfaceInventoryForScheduler
  resyncNodeInventoryForScheduler: typeof resyncNodeInventoryForScheduler
  resyncEpgInventoryForScheduler: typeof resyncEpgInventoryForScheduler
}

const DEFAULT_DEPENDENCIES: ResyncHostDependencies = {
  resyncEndpointInventoryForScheduler,
  resyncInterfaceInventoryForScheduler,
  resyncNodeInventoryForScheduler,
  resyncEpgInventoryForScheduler,
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Resync all four datasets for a single host. Each purpose module owns its own
 * `scheduler` audit entry and cache invalidation, so this runner only sequences
 * them and collects per-dataset outcomes.
 * Never throws: every dataset failure is captured in the returned HostResult.
 */
export async function resyncHost(
  input: ResyncHostInput,
  dependencies: ResyncHostDependencies = DEFAULT_DEPENDENCIES,
): Promise<HostResult> {
  const { apicHostId, hostName, host, username, password } = input
  const {
    resyncEndpointInventoryForScheduler: resyncEndpointInventory,
    resyncInterfaceInventoryForScheduler: resyncInterfaceInventory,
    resyncNodeInventoryForScheduler: resyncNodeInventory,
    resyncEpgInventoryForScheduler: resyncEpgInventory,
  } = dependencies
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
    interfaces = await resyncInterfaceInventory({ ...creds, hostName })
  } catch (err) {
    interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
  }
  result.interfaces = interfaces

  // Nodes & hardware
  let nodes: DatasetResult
  try {
    const r = await resyncNodeInventory({ ...creds, hostName })
    nodes = { synced: r.syncedNodes, total: r.syncedNodes + r.syncedComponents }
  } catch (err) {
    nodes = { error: errorMessage(err, 'Failed to resync nodes') }
  }
  result.nodes = nodes

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
