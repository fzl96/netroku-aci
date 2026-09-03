import {
  parseLegacyDirection,
  parseLegacyPage,
  parseLegacyPageSize,
  parseLegacySort,
  type LegacyPageSize,
} from '@/lib/legacy/query'
import type { LegacyEndpointStatus } from './filters'

export const LEGACY_ENDPOINT_SORTS = [
  'mac',
  'vlan',
  'interface',
  'firstSeen',
  'lastSeen',
  'cleared',
] as const

export type LegacyEndpointSort = (typeof LEGACY_ENDPOINT_SORTS)[number]
export type LegacyEndpointStatusFilter = LegacyEndpointStatus | 'all'

export type RawLegacyEndpointParam = string | string[] | undefined
export type RawLegacyEndpointPageParams = {
  query?: RawLegacyEndpointParam
  site?: RawLegacyEndpointParam
  device?: RawLegacyEndpointParam
  vlan?: RawLegacyEndpointParam
  interface?: RawLegacyEndpointParam
  status?: RawLegacyEndpointParam
  sort?: RawLegacyEndpointParam
  dir?: RawLegacyEndpointParam
  page?: RawLegacyEndpointParam
  pageSize?: RawLegacyEndpointParam
}

export type LegacyEndpointPageParams = {
  query: string
  site: string
  device: string
  vlan: string
  interface: string
  status: LegacyEndpointStatusFilter
  sort: LegacyEndpointSort
  direction: 'asc' | 'desc'
  page: number
  pageSize: LegacyPageSize
}

function first(value: RawLegacyEndpointParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseLegacyEndpointPageParams(
  input: RawLegacyEndpointPageParams,
): LegacyEndpointPageParams {
  const status = first(input.status)
  return {
    query: first(input.query),
    site: first(input.site),
    device: first(input.device),
    vlan: first(input.vlan),
    interface: first(input.interface),
    status: status === 'historical' || status === 'all' ? status : 'active',
    sort: parseLegacySort(first(input.sort), LEGACY_ENDPOINT_SORTS, 'lastSeen'),
    direction: parseLegacyDirection(first(input.dir)),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

/** The `all` filter spans both lifecycle states, so it becomes an empty
 *  narrowing rather than a status predicate. */
export function legacyEndpointStatuses(status: LegacyEndpointStatusFilter): LegacyEndpointStatus[] {
  return status === 'all' ? ['active', 'historical'] : [status]
}

export function buildLegacyEndpointPageUrl(params: LegacyEndpointPageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.site) search.set('site', params.site)
  if (params.device) search.set('device', params.device)
  if (params.vlan) search.set('vlan', params.vlan)
  if (params.interface) search.set('interface', params.interface)
  if (params.status !== 'active') search.set('status', params.status)
  if (params.sort !== 'lastSeen') search.set('sort', params.sort)
  if (params.direction !== 'desc') search.set('dir', params.direction)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/endpoints${value ? `?${value}` : ''}`
}
