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

export type SortDirection = 'asc' | 'desc'

export type EndpointSortKey =
  | 'mac'
  | 'ip'
  | 'vlan'
  | 'node'
  | 'interface'
  | 'epgDescr'
  | 'firstSeenAt'
  | 'lastSeenAt'
  | 'status'

export type PortSortKey =
  | 'node'
  | 'interface'
  | 'endpointCount'
  | 'vlans'
  | 'epgDescrs'
  | 'lastSeenAt'

type SortValue = string | number | Date | null

function compareValues(a: SortValue, b: SortValue): number {
  const aMissing = a === null || a === ''
  const bMissing = b === null || b === ''
  if (aMissing || bMissing) {
    if (aMissing && bMissing) return 0
    return aMissing ? 1 : -1
  }

  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return NATURAL_COLLATOR.compare(String(a), String(b))
}

function stableSort<T>(rows: T[], direction: SortDirection, compare: (a: T, b: T) => number): T[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => multiplier * compare(a.row, b.row) || a.index - b.index)
    .map(({ row }) => row)
}

function endpointValue(endpoint: Endpoint, key: EndpointSortKey): SortValue {
  switch (key) {
    case 'status': return endpoint.isActive ? 0 : 1
    case 'firstSeenAt': return endpoint.firstSeenAt
    case 'lastSeenAt': return endpoint.lastSeenAt
    default: return endpoint[key]
  }
}

function portValue(port: EndpointPortSummary, key: PortSortKey): SortValue {
  switch (key) {
    case 'vlans': return port.vlans.join(', ')
    case 'epgDescrs': return port.epgDescrs.join(', ')
    default: return port[key]
  }
}

export function sortEndpointRows(rows: Endpoint[], key: EndpointSortKey, direction: SortDirection): Endpoint[] {
  return stableSort(rows, direction, (a, b) => compareValues(endpointValue(a, key), endpointValue(b, key)))
}

export function sortPortRows(rows: EndpointPortSummary[], key: PortSortKey, direction: SortDirection): EndpointPortSummary[] {
  return stableSort(rows, direction, (a, b) => compareValues(portValue(a, key), portValue(b, key)))
}

export function nextSortState<K extends string>(
  currentKey: K | undefined,
  currentDirection: SortDirection | undefined,
  nextKey: K,
): { key: K; direction: SortDirection } {
  return currentKey === nextKey && currentDirection === 'asc'
    ? { key: nextKey, direction: 'desc' }
    : { key: nextKey, direction: 'asc' }
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
