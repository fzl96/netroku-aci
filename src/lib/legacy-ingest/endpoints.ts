import type { LegacyEndpointPayload } from '@/lib/schemas/legacy-ingest'
import {
  defaultLegacyDb,
  ingestLegacyFeature,
  normalizeLegacyKey,
  type LegacyApplyContext,
  type LegacyIngestCounts,
  type LegacyIngestResult,
} from './common'

type FetchedEndpoint = LegacyEndpointPayload['endpoints'][number]

export interface ActiveLegacyEndpoint {
  id: string
  mac: string
  ipKey: string
  interfaceKey: string
  vlan: string
}

export interface LegacyEndpointPlan {
  inserts: FetchedEndpoint[]
  updates: Array<{ id: string; endpoint: FetchedEndpoint }>
  clears: string[]
}

function identity(endpoint: { mac: string; ip?: string | null; ipKey?: string }): string {
  return `${endpoint.mac}|${endpoint.ipKey ?? endpoint.ip ?? ''}`
}

export function planLegacyEndpointReconcile(
  active: ActiveLegacyEndpoint[],
  fetched: FetchedEndpoint[],
): LegacyEndpointPlan {
  const activeByIdentity = new Map(active.map(row => [identity(row), row]))
  const fetchedByIdentity = new Map<string, FetchedEndpoint>()
  for (const endpoint of fetched) fetchedByIdentity.set(identity(endpoint), endpoint)
  const plan: LegacyEndpointPlan = { inserts: [], updates: [], clears: [] }

  for (const [key, endpoint] of fetchedByIdentity) {
    const current = activeByIdentity.get(key)
    if (!current) {
      plan.inserts.push(endpoint)
    } else if (
      current.interfaceKey !== normalizeLegacyKey(endpoint.interface)
      || current.vlan !== endpoint.vlan
    ) {
      plan.clears.push(current.id)
      plan.inserts.push(endpoint)
    } else {
      plan.updates.push({ id: current.id, endpoint })
    }
    activeByIdentity.delete(key)
  }
  plan.clears.push(...Array.from(activeByIdentity.values(), row => row.id))
  return plan
}

export async function applyLegacyEndpoints(
  context: LegacyApplyContext,
  payload: LegacyEndpointPayload,
): Promise<LegacyIngestCounts> {
  const { tx, deviceId, collectedAt } = context
  const active = await tx.legacyEndpoint.findMany({
    where: { deviceId, isActive: true },
    select: { id: true, mac: true, ipKey: true, interfaceKey: true, vlan: true },
  })
  const plan = planLegacyEndpointReconcile(active, payload.endpoints)

  const cleared = plan.clears.length > 0
    ? await tx.legacyEndpoint.updateMany({
        where: { id: { in: plan.clears }, isActive: true },
        data: { isActive: false, clearedAt: collectedAt },
      })
    : { count: 0 }

  for (const update of plan.updates) {
    await tx.legacyEndpoint.update({
      where: { id: update.id },
      data: {
        ip: update.endpoint.ip,
        vlanName: update.endpoint.vlan_name,
        interface: update.endpoint.interface,
        interfaceKey: normalizeLegacyKey(update.endpoint.interface),
        learningType: update.endpoint.learning_type,
        macFlag: update.endpoint.mac_flag,
        lastSeenAt: collectedAt,
      },
    })
  }

  const inserted = plan.inserts.length > 0
    ? await tx.legacyEndpoint.createMany({
        data: plan.inserts.map(endpoint => ({
          deviceId,
          mac: endpoint.mac,
          ip: endpoint.ip,
          ipKey: endpoint.ip ?? '',
          vlan: endpoint.vlan,
          vlanName: endpoint.vlan_name,
          interface: endpoint.interface,
          interfaceKey: normalizeLegacyKey(endpoint.interface),
          learningType: endpoint.learning_type,
          macFlag: endpoint.mac_flag,
          isActive: true,
          firstSeenAt: collectedAt,
          lastSeenAt: collectedAt,
        })),
      })
    : { count: 0 }

  await tx.legacyDevice.update({
    where: { id: deviceId },
    data: { lastEndpointSyncAt: collectedAt },
  })
  return {
    inserted: inserted.count,
    updated: plan.updates.length,
    cleared: cleared.count,
    samples: 0,
  }
}

export function ingestLegacyEndpoints(
  payload: LegacyEndpointPayload,
  db = defaultLegacyDb,
): Promise<LegacyIngestResult> {
  return ingestLegacyFeature(
    db,
    'endpoints',
    payload,
    context => applyLegacyEndpoints(context, payload),
  )
}
