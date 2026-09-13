export const RECORD_GROUPS = {
  'aci-endpoints': 'ACI endpoints',
  epgs: 'ACI EPGs',
  nodes: 'ACI nodes',
  'legacy-devices': 'Legacy devices',
  'legacy-endpoints': 'Legacy endpoints',
  sites: 'Inventory sites',
  racks: 'Inventory racks',
  devices: 'Inventory devices',
} as const

export type RecordGroup = keyof typeof RECORD_GROUPS
export type SearchResult = {
  id: string
  title: string
  description: string
  href: string
}
export type SearchGroup = {
  id: string
  label: string
  items: SearchResult[]
  error?: boolean
}
export type SearchResponse = { groups: SearchGroup[] }

export const SEARCH_LIMIT = 5
export const MIN_RECORD_QUERY = 3
export const MAX_SEARCH_QUERY = 120

export function normalizeSearchQuery(value: string): string {
  return value.trim().slice(0, MAX_SEARCH_QUERY).toLowerCase()
}

export function normalizedMac(value: string): string | null {
  const compact = value.replace(/[:.\-\s]/g, '').toLowerCase()
  return /^[a-f0-9]{3,12}$/.test(compact) ? compact : null
}

/** User text is literal, including SQL LIKE wildcard characters. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

export function searchHref(path: string, values: Record<string, string>): string {
  return `${path}?${new URLSearchParams(values)}`
}

export function isRecordGroup(value: string): value is RecordGroup {
  return Object.hasOwn(RECORD_GROUPS, value)
}
