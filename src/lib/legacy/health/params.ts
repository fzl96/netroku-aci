import {
  parseLegacyDirection,
  parseLegacyPage,
  parseLegacyPageSize,
  parseLegacySort,
  type LegacyPageSize,
} from '@/lib/legacy/query'

export const LEGACY_HEALTH_SORTS = ['collected', 'hostname', 'site', 'managementIp'] as const

export type LegacyHealthSort = (typeof LEGACY_HEALTH_SORTS)[number]

export type RawLegacyHealthParam = string | string[] | undefined
export type RawLegacyHealthPageParams = {
  query?: RawLegacyHealthParam
  site?: RawLegacyHealthParam
  sort?: RawLegacyHealthParam
  dir?: RawLegacyHealthParam
  page?: RawLegacyHealthParam
  pageSize?: RawLegacyHealthParam
}

export type LegacyHealthPageParams = {
  query: string
  site: string
  sort: LegacyHealthSort
  direction: 'asc' | 'desc'
  page: number
  pageSize: LegacyPageSize
}

function first(value: RawLegacyHealthParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseLegacyHealthPageParams(
  input: RawLegacyHealthPageParams,
): LegacyHealthPageParams {
  return {
    query: first(input.query),
    site: first(input.site),
    sort: parseLegacySort(first(input.sort), LEGACY_HEALTH_SORTS, 'collected'),
    direction: parseLegacyDirection(first(input.dir)),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

export function buildLegacyHealthPageUrl(params: LegacyHealthPageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.site) search.set('site', params.site)
  if (params.sort !== 'collected') search.set('sort', params.sort)
  if (params.direction !== 'desc') search.set('dir', params.direction)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/health${value ? `?${value}` : ''}`
}
