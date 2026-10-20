import { z } from 'zod'

export const BD_PAGE_SIZES = [10, 50, 100, 1000] as const
export type BdPageSize = (typeof BD_PAGE_SIZES)[number] | 'all'
type RawValue = string | string[] | undefined
export type RawBdParams = Record<string, RawValue>
export type BdFilters = {
  query?: string
  tenant?: string[]
  vrf?: string[]
  routing?: 'yes' | 'no'
}
export type BdPageParams = BdFilters & { hostId: string; page: number; pageSize: BdPageSize }
const first = (v: RawValue) => (Array.isArray(v) ? v[0] : v)?.trim() ?? ''
const list = (v: RawValue) =>
  [
    ...new Set(
      (Array.isArray(v) ? v : v ? [v] : [])
        .flatMap((s) => s.split(','))
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ].sort()

export function parseBdPageParams(raw: RawBdParams): BdPageParams {
  const page = Number(first(raw.page))
  const size = first(raw.pageSize)
  const routing = first(raw.routing)
  return {
    hostId: first(raw.apic),
    query: first(raw.query),
    tenant: list(raw.tenant),
    vrf: list(raw.vrf),
    ...(routing === 'yes' || routing === 'no' ? { routing } : {}),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize:
      size === 'all'
        ? 'all'
        : (BD_PAGE_SIZES as readonly number[]).includes(Number(size))
          ? (Number(size) as BdPageSize)
          : 50,
  }
}
export function buildBdPageUrl(params: BdPageParams): string {
  const search = new URLSearchParams()
  if (params.hostId) search.set('apic', params.hostId)
  if (params.query?.trim()) search.set('query', params.query.trim())
  if (params.tenant?.length) search.set('tenant', params.tenant.join(','))
  if (params.vrf?.length) search.set('vrf', params.vrf.join(','))
  if (params.routing) search.set('routing', params.routing)
  if (params.page > 1) search.set('page', String(params.page))
  if (params.pageSize !== 50) search.set('pageSize', String(params.pageSize))
  return `/bds${search.size ? `?${search}` : ''}`
}
export function hasBdFilters(filters: BdFilters): boolean {
  return Boolean(
    filters.query?.trim() || filters.tenant?.length || filters.vrf?.length || filters.routing,
  )
}
export const bdExportSchema = z.object({
  apicHostId: z.string().trim().min(1),
  scope: z.enum(['all', 'filtered']),
  filters: z
    .object({
      query: z.string().optional(),
      tenant: z.array(z.string()).optional(),
      vrf: z.array(z.string()).optional(),
      routing: z.enum(['yes', 'no']).optional(),
    })
    .optional(),
})
