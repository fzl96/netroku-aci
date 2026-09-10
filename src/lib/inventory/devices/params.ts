import type { Prisma } from '@prisma/client'
import { parseLegacyList } from '@/lib/legacy/query'

export const DEVICE_PAGE_SIZE = 20

export type RawDeviceListParam = string | string[] | undefined
export type RawDeviceListParams = {
  q?: RawDeviceListParam
  site?: RawDeviceListParam
  page?: RawDeviceListParam
}

export type DeviceListParams = {
  query: string
  /** Site ids. A device matches when its rack sits in any of them. */
  sites: string[]
  page: number
}

function first(value: RawDeviceListParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseDeviceListParams(input: RawDeviceListParams): DeviceListParams {
  const parsedPage = Number.parseInt(first(input.page) || '1', 10)
  return {
    query: first(input.q),
    sites: parseLegacyList(input.site),
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

export function buildDeviceWhere(params: DeviceListParams): Prisma.DeviceWhereInput {
  const filters: Prisma.DeviceWhereInput[] = []
  if (params.sites.length) filters.push({ rack: { siteId: { in: params.sites } } })
  if (params.query) {
    filters.push({
      OR: [
        { name: { contains: params.query, mode: 'insensitive' } },
        { serialNumber: { contains: params.query, mode: 'insensitive' } },
        { assetTag: { contains: params.query, mode: 'insensitive' } },
        { managementIp: { contains: params.query, mode: 'insensitive' } },
        { vendor: { contains: params.query, mode: 'insensitive' } },
        { model: { contains: params.query, mode: 'insensitive' } },
        { rack: { name: { contains: params.query, mode: 'insensitive' } } },
        { rack: { site: { name: { contains: params.query, mode: 'insensitive' } } } },
        { deviceStack: { name: { contains: params.query, mode: 'insensitive' } } },
      ],
    })
  }
  if (filters.length <= 1) return filters[0] ?? {}
  return { AND: filters }
}

export function clampDevicePage(page: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / DEVICE_PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

export function deviceListWindow(page: number, total: number) {
  const effectivePage = clampDevicePage(page, total)
  return {
    page: effectivePage,
    skip: (effectivePage - 1) * DEVICE_PAGE_SIZE,
    take: DEVICE_PAGE_SIZE,
  }
}

export function buildDeviceListUrl(params: DeviceListParams): string {
  const search = new URLSearchParams()
  if (params.query.trim()) search.set('q', params.query.trim())
  if (params.sites.length) search.set('site', params.sites.join(','))
  if (params.page > 1) search.set('page', String(params.page))
  const queryString = search.toString()
  return `/inventory/devices${queryString ? `?${queryString}` : ''}`
}
