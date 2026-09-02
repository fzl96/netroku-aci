import type { Prisma } from '@prisma/client'

export const DEVICE_PAGE_SIZE = 20

export type RawDeviceListParam = string | string[] | undefined
export type RawDeviceListParams = { q?: RawDeviceListParam; page?: RawDeviceListParam }

export type DeviceListParams = {
  query: string
  page: number
}

function first(value: RawDeviceListParam): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
}

export function parseDeviceListParams(input: RawDeviceListParams): DeviceListParams {
  const parsedPage = Number.parseInt(first(input.page) || '1', 10)
  return {
    query: first(input.q),
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

export function buildDeviceWhere(params: DeviceListParams): Prisma.DeviceWhereInput {
  if (!params.query) return {}
  return {
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
  }
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
  if (params.page > 1) search.set('page', String(params.page))
  const queryString = search.toString()
  return `/inventory/devices${queryString ? `?${queryString}` : ''}`
}

export function buildDeviceSearchUrl(query: string): string {
  return buildDeviceListUrl({ query, page: 1 })
}
