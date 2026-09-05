import {
  parseLegacyList,
  parseLegacyPage,
  parseLegacyPageSize,
  type LegacyPageSize,
} from '@/lib/legacy/query'

export type RawLegacyDeviceParam = string | string[] | undefined
export type RawLegacyDevicePageParams = {
  query?: RawLegacyDeviceParam
  site?: RawLegacyDeviceParam
  deviceType?: RawLegacyDeviceParam
  page?: RawLegacyDeviceParam
  pageSize?: RawLegacyDeviceParam
}

export type LegacyDevicePageParams = {
  query: string
  sites: string[]
  deviceTypes: string[]
  page: number
  pageSize: LegacyPageSize
}

function first(value: RawLegacyDeviceParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseLegacyDevicePageParams(
  input: RawLegacyDevicePageParams,
): LegacyDevicePageParams {
  return {
    query: first(input.query),
    sites: parseLegacyList(input.site),
    deviceTypes: parseLegacyList(input.deviceType),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

export function buildLegacyDevicePageUrl(params: LegacyDevicePageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.sites.length) search.set('site', params.sites.join(','))
  if (params.deviceTypes.length) search.set('deviceType', params.deviceTypes.join(','))
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/devices${value ? `?${value}` : ''}`
}
