import {
  parseLegacyList,
  parseLegacyPage,
  parseLegacyPageSize,
  type LegacyPageSize,
} from '@/lib/legacy/query'

export type RawLegacyHealthParam = string | string[] | undefined
export type RawLegacyHealthPageParams = {
  query?: RawLegacyHealthParam
  site?: RawLegacyHealthParam
  page?: RawLegacyHealthParam
  pageSize?: RawLegacyHealthParam
}

export type LegacyHealthPageParams = {
  query: string
  sites: string[]
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
    sites: parseLegacyList(input.site),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

export function buildLegacyHealthPageUrl(params: LegacyHealthPageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.sites.length) search.set('site', params.sites.join(','))
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/health${value ? `?${value}` : ''}`
}
