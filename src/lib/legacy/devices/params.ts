import {
  parseLegacyDirection,
  parseLegacyPage,
  parseLegacyPageSize,
  parseLegacySort,
  type LegacyPageSize,
} from '@/lib/legacy/query'

export const LEGACY_DEVICE_SORTS = [
  'hostname',
  'site',
  'managementIp',
  'model',
  'lastSeenAt',
] as const

export type LegacyDeviceSort = typeof LEGACY_DEVICE_SORTS[number]

export type RawLegacyDeviceParam = string | string[] | undefined
export type RawLegacyDevicePageParams = {
  query?: RawLegacyDeviceParam
  site?: RawLegacyDeviceParam
  deviceType?: RawLegacyDeviceParam
  sort?: RawLegacyDeviceParam
  dir?: RawLegacyDeviceParam
  page?: RawLegacyDeviceParam
  pageSize?: RawLegacyDeviceParam
}

export type LegacyDevicePageParams = {
  query: string
  site: string
  deviceType: string
  sort: LegacyDeviceSort
  direction: 'asc' | 'desc'
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
    site: first(input.site),
    deviceType: first(input.deviceType),
    sort: parseLegacySort(first(input.sort), LEGACY_DEVICE_SORTS, 'lastSeenAt'),
    direction: parseLegacyDirection(first(input.dir)),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

export function buildLegacyDevicePageUrl(params: LegacyDevicePageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.site) search.set('site', params.site)
  if (params.deviceType) search.set('deviceType', params.deviceType)
  if (params.sort !== 'lastSeenAt') search.set('sort', params.sort)
  if (params.direction !== 'desc') search.set('dir', params.direction)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/devices${value ? `?${value}` : ''}`
}
