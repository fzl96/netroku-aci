import { searchHref, type RecordGroup, type SearchResult } from './types'

export type SearchRow = {
  id: string
  title: string
  detail: string
  sourceId: string
  sourceName: string
  identity: string
  active: boolean
  matches: number
}

function destination(group: RecordGroup, row: SearchRow, history: boolean): string {
  switch (group) {
    case 'aci-endpoints':
      return searchHref('/endpoints', {
        apic: row.sourceId,
        mac: row.identity,
        status: history ? 'active,historical' : 'active',
      })
    case 'legacy-endpoints':
      return searchHref('/legacy/endpoints', {
        device: row.sourceId,
        mac: row.identity,
        status: history ? 'all' : 'active',
      })
    case 'epgs':
      return searchHref('/epgs', { apic: row.sourceId, selected: row.identity })
    case 'nodes':
      return searchHref('/nodes', { apic: row.sourceId, selected: row.id })
    case 'legacy-devices':
      return searchHref('/legacy/devices', { selected: row.id })
    case 'sites':
      return searchHref('/inventory/racks', { siteId: row.id, selectedSite: row.id })
    case 'racks':
      return searchHref('/inventory/racks', { siteId: row.sourceId, selectedRack: row.id })
    case 'devices':
      return `/inventory/devices/${encodeURIComponent(row.id)}`
  }
}

export function serializeSearchResult(
  group: RecordGroup,
  row: SearchRow,
  history: boolean,
): SearchResult {
  return {
    id: `${group}:${row.sourceId}:${row.identity}`,
    title: row.title,
    description: [
      row.sourceName,
      row.detail,
      !row.active ? 'Historical' : '',
      row.matches > 1 ? `+${row.matches - 1} matching placements` : '',
    ]
      .filter(Boolean)
      .join(' · '),
    href: destination(group, row, history),
  }
}
