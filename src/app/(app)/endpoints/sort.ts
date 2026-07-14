import type { Endpoint } from '@prisma/client'

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export interface EndpointPortSummary {
  id: string
  node: string
  interface: string
  endpointCount: number
  activeCount: number
  historicalCount: number
  vlans: string[]
  epgDescrs: string[]
  lastSeenAt: string
  endpoints: Endpoint[]
}

/** Group endpoints into unique ports (node + interface) and natural sort by node then interface. */
export function groupEndpointsByPort(endpoints: Endpoint[]): EndpointPortSummary[] {
  const map = new Map<string, EndpointPortSummary>()

  for (const ep of endpoints) {
    const node = ep.node || '—'
    const iface = ep.interface || '—'
    const key = `${node}:${iface}`
    let summary = map.get(key)
    if (!summary) {
      summary = {
        id: key,
        node,
        interface: iface,
        endpointCount: 0,
        activeCount: 0,
        historicalCount: 0,
        vlans: [],
        epgDescrs: [],
        lastSeenAt: ep.lastSeenAt ? new Date(ep.lastSeenAt).toISOString() : '',
        endpoints: [],
      }
      map.set(key, summary)
    }

    summary.endpointCount += 1
    if (ep.isActive) {
      summary.activeCount += 1
    } else {
      summary.historicalCount += 1
    }

    if (ep.vlan && !summary.vlans.includes(ep.vlan)) {
      summary.vlans.push(ep.vlan)
    }

    if (ep.epgDescr && !summary.epgDescrs.includes(ep.epgDescr)) {
      summary.epgDescrs.push(ep.epgDescr)
    }

    if (ep.lastSeenAt) {
      const epDateStr = new Date(ep.lastSeenAt).toISOString()
      if (!summary.lastSeenAt || epDateStr > summary.lastSeenAt) {
        summary.lastSeenAt = epDateStr
      }
    }

    summary.endpoints.push(ep)
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.node, b.node)
      || NATURAL_COLLATOR.compare(a.interface, b.interface)
      || (new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime()),
  )
}
