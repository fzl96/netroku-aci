import type { ApicEndpointRow } from './endpoints'

export interface ActiveEndpoint {
  id: string
  mac: string
  ip: string
  vlan: string
  dn: string
  node: string
  interface: string
  epgDescr: string
}

export interface EndpointResyncPlan {
  /** New active rows to create (brand-new endpoints + the new placement of moved ones). */
  inserts: ApicEndpointRow[]
  /** Ids of active rows that are unchanged — bump lastSeenAt only. */
  bumps: string[]
  /** Active rows whose only change is epgDescr — update in place (also bumps lastSeenAt). */
  relabels: { id: string; epgDescr: string }[]
  /** Ids of active rows to mark inactive (moved old placement + endpoints that left the fabric). */
  clears: string[]
}

const CEP_SUFFIX = /\/cep-[^/]+$/

/** EPG identity for an endpoint: the dn with its trailing /cep-<mac> segment removed. */
export function epgKeyFromDn(dn: string): string {
  return dn.replace(CEP_SUFFIX, '')
}

function isMove(current: ActiveEndpoint, next: ApicEndpointRow): boolean {
  return current.node !== next.node
    || current.interface !== next.interface
    || current.vlan !== next.vlan
    || epgKeyFromDn(current.dn) !== epgKeyFromDn(next.dn)
}

function key(row: { mac: string; ip: string }): string {
  return `${row.mac}|${row.ip}`
}

/**
 * Decide what a resync should do to the placement-history table.
 * `activeRows` must contain at most one row per (mac, ip) — the current active set.
 * `fetched` should already be deduplicated by (mac, ip).
 */
export function planEndpointResync(
  activeRows: ActiveEndpoint[],
  fetched: ApicEndpointRow[],
): EndpointResyncPlan {
  const activeByKey = new Map<string, ActiveEndpoint>()
  for (const row of activeRows) activeByKey.set(key(row), row)

  const plan: EndpointResyncPlan = { inserts: [], bumps: [], relabels: [], clears: [] }
  const seen = new Set<string>()

  for (const row of fetched) {
    const k = key(row)
    seen.add(k)
    const current = activeByKey.get(k)

    if (!current) {
      plan.inserts.push(row)
    } else if (isMove(current, row)) {
      plan.clears.push(current.id)
      plan.inserts.push(row)
    } else if (current.epgDescr !== row.epgDescr) {
      plan.relabels.push({ id: current.id, epgDescr: row.epgDescr })
    } else {
      plan.bumps.push(current.id)
    }
  }

  for (const [k, current] of activeByKey) {
    if (!seen.has(k)) plan.clears.push(current.id)
  }

  return plan
}
