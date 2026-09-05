import {
  parseLegacyList,
  parseLegacyPage,
  parseLegacyPageSize,
  type LegacyPageSize,
} from '@/lib/legacy/query'
import type { LegacyEndpointStatus } from './filters'

export const LEGACY_ENDPOINT_STATUSES: readonly LegacyEndpointStatus[] = ['active', 'historical']

export type RawLegacyEndpointParam = string | string[] | undefined
export type RawLegacyEndpointPageParams = {
  query?: RawLegacyEndpointParam
  site?: RawLegacyEndpointParam
  device?: RawLegacyEndpointParam
  vlan?: RawLegacyEndpointParam
  interface?: RawLegacyEndpointParam
  status?: RawLegacyEndpointParam
  page?: RawLegacyEndpointParam
  pageSize?: RawLegacyEndpointParam
}

export type LegacyEndpointPageParams = {
  query: string
  sites: string[]
  devices: string[]
  vlans: string[]
  interfaces: string[]
  statuses: LegacyEndpointStatus[]
  page: number
  pageSize: LegacyPageSize
}

function first(value: RawLegacyEndpointParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

/** Lifecycle is a checkbox group like every other filter, but the page opens on
 *  active endpoints because historical records outnumber them. An absent param
 *  therefore means active, and clearing the group — which the URL spells `all`
 *  — is what asks for both. */
function parseStatuses(value: RawLegacyEndpointParam): LegacyEndpointStatus[] {
  const raw = parseLegacyList(value)
  if (raw.length === 0) return ['active']
  return LEGACY_ENDPOINT_STATUSES.filter((status) => raw.includes(status))
}

export function parseLegacyEndpointPageParams(
  input: RawLegacyEndpointPageParams,
): LegacyEndpointPageParams {
  return {
    query: first(input.query),
    sites: parseLegacyList(input.site),
    devices: parseLegacyList(input.device),
    vlans: parseLegacyList(input.vlan),
    interfaces: parseLegacyList(input.interface),
    statuses: parseStatuses(input.status),
    page: parseLegacyPage(first(input.page)),
    pageSize: parseLegacyPageSize(first(input.pageSize)),
  }
}

function statusParam(statuses: LegacyEndpointStatus[]): string | null {
  if (statuses.length === 1 && statuses[0] === 'active') return null
  return statuses.length === 0 ? 'all' : statuses.join(',')
}

export function buildLegacyEndpointPageUrl(params: LegacyEndpointPageParams): string {
  const search = new URLSearchParams()
  if (params.query) search.set('query', params.query)
  if (params.sites.length) search.set('site', params.sites.join(','))
  if (params.devices.length) search.set('device', params.devices.join(','))
  if (params.vlans.length) search.set('vlan', params.vlans.join(','))
  if (params.interfaces.length) search.set('interface', params.interfaces.join(','))
  const status = statusParam(params.statuses)
  if (status) search.set('status', status)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  const value = search.toString()
  return `/legacy/endpoints${value ? `?${value}` : ''}`
}
