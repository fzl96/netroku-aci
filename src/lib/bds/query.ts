import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { getApicHosts, ApicHostReadError } from '@/lib/apic-hosts/query'
import { prisma } from '@/lib/prisma'
import type { BdFilters, BdPageParams } from './params'
import { bdEpgsSchema, bdSubnetsSchema, type BdRow } from './types'

const BD_SELECT = {
  id: true,
  apicHostId: true,
  dn: true,
  name: true,
  tenant: true,
  description: true,
  vrf: true,
  vrfDn: true,
  unicastRoute: true,
  arpFlood: true,
  ipLearning: true,
  limitIpLearnToSubnets: true,
  unkMacUcastAct: true,
  unkMcastAct: true,
  multiDstPktAct: true,
  subnets: true,
  l3Outs: true,
  epgs: true,
  epgCount: true,
} satisfies Prisma.BdSnapshotSelect
type StoredRow = Prisma.BdSnapshotGetPayload<{ select: typeof BD_SELECT }>
function serialize(row: StoredRow): BdRow {
  return { ...row, subnets: bdSubnetsSchema.parse(row.subnets), epgs: bdEpgsSchema.parse(row.epgs) }
}
const cacheOptions = (hostId: string) => ({
  tags: ['bds:all', `bds:host:${hostId}`],
  revalidate: 8 * 60 * 60,
})
export class BdReadError extends Error {}
async function authorize() {
  try {
    await requireSession()
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) throw new BdReadError('Unauthorized')
    throw error
  }
}
export type BdHost = { id: string; name: string; host: string }
export type BdHostResolution =
  | { kind: 'selected'; host: BdHost; hosts: BdHost[] }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
export const resolveBdHost = cache(async (requestedHostId: string): Promise<BdHostResolution> => {
  let hosts: BdHost[]
  try {
    hosts = (await getApicHosts()).map(({ id, name, host }) => ({ id, name, host }))
  } catch (error) {
    if (error instanceof ApicHostReadError && error.code === 'unauthorized')
      throw new BdReadError('Unauthorized')
    throw error
  }
  if (!hosts.length) return { kind: 'empty' }
  const host = hosts.find((h) => h.id === requestedHostId)
  return host
    ? { kind: 'selected', host, hosts }
    : { kind: 'redirect', location: `/bds?apic=${encodeURIComponent(hosts[0].id)}` }
})

export function buildBdWhere(hostId: string, filters: BdFilters = {}): Prisma.BdSnapshotWhereInput {
  return {
    apicHostId: hostId,
    ...(filters.query?.trim()
      ? { searchText: { contains: filters.query.trim(), mode: 'insensitive' } }
      : {}),
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.vrf?.length ? { vrf: { in: filters.vrf } } : {}),
    ...(filters.routing ? { unicastRoute: filters.routing === 'yes' } : {}),
  }
}
export type BdOverview = {
  hostTotal: number
  filteredTotal: number
  lastBdSyncAt: string | null
  choices: { tenants: string[]; vrfs: string[] }
}
export async function getBdOverview(params: BdPageParams): Promise<BdOverview> {
  await authorize()
  return unstable_cache(
    async () => {
      const where = { apicHostId: params.hostId }
      const [host, choices, hostTotal, filteredTotal] = await Promise.all([
        prisma.apicHost.findUnique({
          where: { id: params.hostId },
          select: { lastBdSyncAt: true },
        }),
        prisma.bdSnapshot.findMany({
          where,
          select: { tenant: true, vrf: true },
          distinct: ['tenant', 'vrf'],
        }),
        prisma.bdSnapshot.count({ where }),
        prisma.bdSnapshot.count({ where: buildBdWhere(params.hostId, params) }),
      ])
      return {
        hostTotal,
        filteredTotal,
        lastBdSyncAt: host?.lastBdSyncAt?.toISOString() ?? null,
        choices: {
          tenants: [...new Set(choices.map((r) => r.tenant).filter(Boolean))].sort(),
          vrfs: [...new Set(choices.map((r) => r.vrf).filter(Boolean))].sort(),
        },
      }
    },
    ['bds', 'overview', params.hostId, JSON.stringify(buildBdWhere(params.hostId, params))],
    cacheOptions(params.hostId),
  )()
}
export type BdResultsData = {
  rows: BdRow[]
  pagination: {
    page: number
    pageSize: BdPageParams['pageSize']
    total: number
    totalPages: number
  }
}
export async function getBdResults(params: BdPageParams): Promise<BdResultsData> {
  await authorize()
  return unstable_cache(
    async () => {
      const where = buildBdWhere(params.hostId, params)
      const total = await prisma.bdSnapshot.count({ where })
      const totalPages =
        params.pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / params.pageSize))
      const page = Math.min(params.page, totalPages)
      const rows = await prisma.bdSnapshot.findMany({
        where,
        select: BD_SELECT,
        orderBy: [{ tenant: 'asc' }, { name: 'asc' }, { dn: 'asc' }],
        ...(params.pageSize === 'all'
          ? {}
          : { skip: (page - 1) * params.pageSize, take: params.pageSize }),
      })
      return {
        rows: rows.map(serialize),
        pagination: { page, pageSize: params.pageSize, total, totalPages },
      }
    },
    ['bds', 'results', JSON.stringify(params)],
    cacheOptions(params.hostId),
  )()
}
export async function getBdExportData(input: {
  hostId: string
  scope: 'all' | 'filtered'
  filters?: BdFilters
}) {
  try {
    await authorize()
  } catch (error) {
    if (error instanceof BdReadError) return { kind: 'unauthorized' as const }
    throw error
  }
  const host = await prisma.apicHost.findUnique({
    where: { id: input.hostId },
    select: { name: true },
  })
  if (!host) return { kind: 'host-not-found' as const }
  const where = buildBdWhere(input.hostId, input.scope === 'filtered' ? input.filters : {})
  const rows = await unstable_cache(
    async () =>
      (
        await prisma.bdSnapshot.findMany({
          where,
          select: BD_SELECT,
          orderBy: [{ tenant: 'asc' }, { name: 'asc' }, { dn: 'asc' }],
        })
      ).map(serialize),
    ['bds', 'export', JSON.stringify(where)],
    cacheOptions(input.hostId),
  )()
  return { kind: 'ready' as const, host, rows }
}
export type BdLoadState<T> = { kind: 'ready'; data: T } | { kind: 'inactive' } | { kind: 'error' }
export type BdOverviewPayload = { params: BdPageParams; hosts: BdHost[]; overview: BdOverview }
export type BdResultsPayload = { params: BdPageParams; results: BdResultsData }
