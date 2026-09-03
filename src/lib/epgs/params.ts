export const EPG_PAGE_SIZES = [10, 50, 100, 1000] as const

export type EpgView = 'epg' | 'port'
export type EpgPageSize = typeof EPG_PAGE_SIZES[number] | 'all'
export type RawEpgPageParam = string | string[] | undefined
export type RawEpgPageParams = {
  apic?: RawEpgPageParam
  view?: RawEpgPageParam
  query?: RawEpgPageParam
  page?: RawEpgPageParam
  pageSize?: RawEpgPageParam
  tenant?: RawEpgPageParam
  ap?: RawEpgPageParam
  node?: RawEpgPageParam
}

export type EpgPageParams = {
  hostId: string
  view: EpgView
  query: string
  page: number
  pageSize: EpgPageSize
  tenants: string[]
  appProfiles: string[]
  nodes: string[]
}

export type EpgFilters = {
  query?: string
  tenant?: string[]
  ap?: string[]
  node?: string[]
}

const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

function first(value: RawEpgPageParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function list(value: RawEpgPageParam): string[] {
  const input = Array.isArray(value) ? value : value === undefined ? [] : [value]
  return Array.from(new Set(input.flatMap(item => item.split(',')).map(item => item.trim()).filter(Boolean)))
    .sort(NATURAL_COLLATOR.compare)
}

function page(value: string): number {
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function pageSize(value: string): EpgPageSize {
  if (value === 'all') return 'all'
  if (!/^\d+$/.test(value)) return 50
  const parsed = Number(value)
  return (EPG_PAGE_SIZES as readonly number[]).includes(parsed) ? parsed as EpgPageSize : 50
}

export function parseEpgPageParams(input: RawEpgPageParams): EpgPageParams {
  const view: EpgView = first(input.view) === 'port' ? 'port' : 'epg'
  return {
    hostId: first(input.apic), view, query: first(input.query), page: page(first(input.page)),
    pageSize: pageSize(first(input.pageSize)), tenants: list(input.tenant),
    appProfiles: list(input.ap), nodes: view === 'port' ? list(input.node) : [],
  }
}

export function buildEpgPageUrl(params: EpgPageParams): string {
  const search = new URLSearchParams()
  if (params.hostId) search.set('apic', params.hostId)
  if (params.view !== 'epg') search.set('view', params.view)
  if (params.query.trim()) search.set('query', params.query.trim())
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  if (params.tenants.length) search.set('tenant', params.tenants.join(','))
  if (params.appProfiles.length) search.set('ap', params.appProfiles.join(','))
  if (params.view === 'port' && params.nodes.length) search.set('node', params.nodes.join(','))
  const value = search.toString()
  return `/epgs${value ? `?${value}` : ''}`
}

export function hasActiveEpgFilters(filters: EpgFilters): boolean {
  return Boolean(filters.query?.trim() || filters.tenant?.length || filters.ap?.length || filters.node?.length)
}

export function countActiveEpgFilterGroups(filters: EpgFilters): number {
  return [filters.tenant, filters.ap, filters.node].filter(values => values?.length).length
}
