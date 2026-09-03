export const ENDPOINT_PAGE_SIZES = [10, 50, 100, 1000] as const

export type EndpointView = 'endpoint' | 'port'
export type EndpointPageSize = (typeof ENDPOINT_PAGE_SIZES)[number] | 'all'
export type EndpointStatusFilter = 'active' | 'historical'
export type RawEndpointPageParam = string | string[] | undefined

export type RawEndpointPageParams = {
  apic?: RawEndpointPageParam
  view?: RawEndpointPageParam
  query?: RawEndpointPageParam
  page?: RawEndpointPageParam
  pageSize?: RawEndpointPageParam
  vlan?: RawEndpointPageParam
  node?: RawEndpointPageParam
  iface?: RawEndpointPageParam
  status?: RawEndpointPageParam
}

export type EndpointPageParams = {
  hostId: string
  view: EndpointView
  query: string
  page: number
  pageSize: EndpointPageSize
  vlans: string[]
  nodes: string[]
  interfaces: string[]
  statuses: EndpointStatusFilter[]
}

export interface EndpointFilters {
  query?: string
  vlan?: string[]
  node?: string[]
  iface?: string[]
  status?: EndpointStatusFilter[]
}

const NATURAL_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
})

function firstValue(value: RawEndpointPageParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

function listValues(value: RawEndpointPageParam): string[] {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value]
  const normalized = values
    .flatMap((item) => item.split(','))
    .map((item) => item.trim())
    .filter(Boolean)
  return Array.from(new Set(normalized)).sort(NATURAL_COLLATOR.compare)
}

function parsePositiveInteger(value: string): number {
  if (!/^\d+$/.test(value)) return 1
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

function parsePageSize(value: string): EndpointPageSize {
  if (value === 'all') return 'all'
  if (!/^\d+$/.test(value)) return 50
  const parsed = Number(value)
  return (ENDPOINT_PAGE_SIZES as readonly number[]).includes(parsed)
    ? (parsed as EndpointPageSize)
    : 50
}

function parseStatuses(value: RawEndpointPageParam): EndpointStatusFilter[] {
  const selected = new Set(listValues(value))
  const statuses: EndpointStatusFilter[] = []
  if (selected.has('active')) statuses.push('active')
  if (selected.has('historical')) statuses.push('historical')
  return statuses.length === 2 ? [] : statuses
}

export function parseEndpointPageParams(input: RawEndpointPageParams): EndpointPageParams {
  const view = firstValue(input.view) === 'port' ? 'port' : 'endpoint'

  return {
    hostId: firstValue(input.apic),
    view,
    query: firstValue(input.query),
    page: parsePositiveInteger(firstValue(input.page)),
    pageSize: parsePageSize(firstValue(input.pageSize)),
    vlans: listValues(input.vlan),
    nodes: listValues(input.node),
    interfaces: view === 'endpoint' ? listValues(input.iface) : [],
    statuses: parseStatuses(input.status),
  }
}

export function buildEndpointPageUrl(params: EndpointPageParams): string {
  const search = new URLSearchParams()
  const query = params.query.trim()

  if (params.hostId) search.set('apic', params.hostId)
  if (params.view !== 'endpoint') search.set('view', params.view)
  if (query) search.set('query', query)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  if (params.vlans.length > 0) search.set('vlan', params.vlans.join(','))
  if (params.nodes.length > 0) search.set('node', params.nodes.join(','))
  if (params.view === 'endpoint' && params.interfaces.length > 0) {
    search.set('iface', params.interfaces.join(','))
  }
  if (params.statuses.length === 1) search.set('status', params.statuses[0])

  const queryString = search.toString()
  return `/endpoints${queryString ? `?${queryString}` : ''}`
}

export function hasActiveEndpointFilters(filters: EndpointFilters): boolean {
  return Boolean(
    filters.query?.trim() ||
    filters.vlan?.length ||
    filters.node?.length ||
    filters.iface?.length ||
    filters.status?.length,
  )
}

export function countActiveEndpointFilterGroups(
  filters: EndpointFilters,
  view: EndpointView = 'endpoint',
): number {
  const groups =
    view === 'endpoint'
      ? [filters.vlan, filters.node, filters.iface, filters.status]
      : [filters.vlan, filters.node, filters.status]

  return groups.filter((values) => values && values.length > 0).length
}
