import type { EpgBindingWithEpg } from './query'

const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

export function sortBindingRows<T extends { node: string; port: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port))
}

export interface EpgPortSummary {
  id: string; node: string; port: string; pathType: string; epgCount: number
  tenants: string[]; encaps: string[]; modes: string[]; bindings: EpgBindingWithEpg[]
}

export function groupBindingsByPort(bindings: EpgBindingWithEpg[]): EpgPortSummary[] {
  const map = new Map<string, EpgPortSummary>()
  for (const binding of bindings) {
    const node = binding.node || '—'; const port = binding.port || '—'; const id = `${node}:${port}`
    const summary = map.get(id) ?? { id, node, port, pathType: binding.pathType || 'port', epgCount: 0, tenants: [], encaps: [], modes: [], bindings: [] }
    summary.epgCount += 1
    if (binding.epg.tenant && !summary.tenants.includes(binding.epg.tenant)) summary.tenants.push(binding.epg.tenant)
    if (binding.encap && !summary.encaps.includes(binding.encap)) summary.encaps.push(binding.encap)
    if (binding.mode && !summary.modes.includes(binding.mode)) summary.modes.push(binding.mode)
    summary.bindings.push(binding); map.set(id, summary)
  }
  return Array.from(map.values()).sort((a, b) => NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port))
}
