import type { BindingWithEpg } from '@/lib/epgs/query'

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Natural sort bindings by node then port (eth1/2 before eth1/10). */
export function sortBindingRows<T extends { node: string; port: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port),
  )
}

export interface EpgPortSummary {
  id: string
  node: string
  port: string
  pathType: string
  epgCount: number
  tenants: string[]
  encaps: string[]
  modes: string[]
  bindings: BindingWithEpg[]
}

/** Group path bindings into unique ports (node + port) and natural sort by node then port. */
export function groupBindingsByPort(bindings: BindingWithEpg[]): EpgPortSummary[] {
  const map = new Map<string, EpgPortSummary>()

  for (const b of bindings) {
    const node = b.node || '—'
    const portStr = b.port || '—'
    const key = `${node}:${portStr}`
    let summary = map.get(key)

    if (!summary) {
      summary = {
        id: key,
        node,
        port: portStr,
        pathType: b.pathType || 'port',
        epgCount: 0,
        tenants: [],
        encaps: [],
        modes: [],
        bindings: [],
      }
      map.set(key, summary)
    }

    summary.epgCount += 1

    if (b.epg?.tenant && !summary.tenants.includes(b.epg.tenant)) {
      summary.tenants.push(b.epg.tenant)
    }

    if (b.encap && !summary.encaps.includes(b.encap)) {
      summary.encaps.push(b.encap)
    }

    if (b.mode && !summary.modes.includes(b.mode)) {
      summary.modes.push(b.mode)
    }

    summary.bindings.push(b)
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port),
  )
}
