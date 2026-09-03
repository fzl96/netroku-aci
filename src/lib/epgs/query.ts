import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { ApicHostReadError, getApicHosts } from '@/lib/apic-hosts/query'
import { prisma } from '@/lib/prisma'
import type { EpgExportRow } from './export'
import type { EpgFilters, EpgPageParams, EpgPageSize } from './params'
import { groupBindingsByPort, type EpgPortSummary } from './sort'

const EPG_CACHE_SECONDS = 8 * 60 * 60
const NATURAL_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

const BINDING_SELECT = {
  id: true,
  apicHostId: true,
  epgId: true,
  dn: true,
  pathTDn: true,
  pod: true,
  node: true,
  port: true,
  pathType: true,
  encap: true,
  mode: true,
} satisfies Prisma.EpgPathBindingSelect

const EPG_SELECT = {
  id: true,
  apicHostId: true,
  dn: true,
  name: true,
  tenant: true,
  appProfile: true,
  description: true,
  bridgeDomain: true,
  pcTag: true,
  preferredGroup: true,
  isolation: true,
  domains: true,
  providedContracts: true,
  consumedContracts: true,
  bindings: {
    select: BINDING_SELECT,
    orderBy: [{ node: 'asc' as const }, { port: 'asc' as const }],
  },
} satisfies Prisma.EpgSnapshotSelect

type StoredEpgBinding = Prisma.EpgPathBindingGetPayload<{ select: typeof BINDING_SELECT }>
type StoredEpgRow = Prisma.EpgSnapshotGetPayload<{ select: typeof EPG_SELECT }>
type StoredEpgBindingWithEpg = StoredEpgBinding & {
  epg: { name: string; tenant: string; appProfile: string; dn: string }
}

export type EpgBindingRow = {
  id: string
  apicHostId: string
  epgId: string
  dn: string
  pathTDn: string
  pod: string
  node: string
  port: string
  pathType: string
  encap: string
  mode: string
}

export type EpgRow = {
  id: string
  apicHostId: string
  dn: string
  name: string
  tenant: string
  appProfile: string
  description: string
  bridgeDomain: string
  pcTag: string
  preferredGroup: boolean
  isolation: boolean
  domains: string[]
  providedContracts: string[]
  consumedContracts: string[]
  bindings: EpgBindingRow[]
}

export type EpgBindingWithEpg = EpgBindingRow & {
  epg: { name: string; tenant: string; appProfile: string; dn: string }
}

export type EpgHostOption = { id: string; name: string; host: string }
export type EpgHostResolution =
  | { kind: 'selected'; host: EpgHostOption; hosts: EpgHostOption[] }
  | { kind: 'redirect'; location: string; hosts: EpgHostOption[] }
  | { kind: 'empty'; hosts: [] }

export type EpgOverviewData = {
  hostTotal: number
  filteredTotal: number
  lastEpgSyncAt: string | null
  choices: { tenants: string[]; appProfiles: string[]; nodes: string[] }
}
export type EpgPagination = {
  page: number
  pageSize: EpgPageSize
  total: number
  totalPages: number
}
export type EpgResultsData =
  | { view: 'epg'; rows: EpgRow[]; pagination: EpgPagination }
  | { view: 'port'; rows: EpgPortSummary[]; pagination: EpgPagination }
export type EpgLoadState<T> =
  { kind: 'ready'; data: T } | { kind: 'inactive' } | { kind: 'unauthorized' }
export type EpgOverviewPayload = {
  params: EpgPageParams
  hosts: EpgHostOption[]
  overview: EpgOverviewData
}
export type EpgResultsPayload = {
  params: EpgPageParams
  results: EpgResultsData
}
export type EpgExportSelection = { hostId: string; scope: 'all' | 'filtered'; filters?: EpgFilters }
export type EpgExportData =
  | { kind: 'ready'; host: EpgHostOption; rows: EpgExportRow[] }
  | { kind: 'empty'; host: EpgHostOption }
  | { kind: 'host-not-found' }
  | { kind: 'unauthorized' }

export class EpgReadError extends Error {
  readonly code = 'unauthorized'
  constructor() {
    super('Unauthorized')
    this.name = 'EpgReadError'
  }
}

function cacheOptions(hostId: string) {
  return { tags: ['epgs:all', `epgs:host:${hostId}`], revalidate: EPG_CACHE_SECONDS }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new EpgReadError()
  }
}

function serializeBinding(binding: StoredEpgBinding): EpgBindingRow {
  return {
    id: binding.id,
    apicHostId: binding.apicHostId,
    epgId: binding.epgId,
    dn: binding.dn,
    pathTDn: binding.pathTDn,
    pod: binding.pod,
    node: binding.node,
    port: binding.port,
    pathType: binding.pathType,
    encap: binding.encap,
    mode: binding.mode,
  }
}

function serializeEpg(row: StoredEpgRow): EpgRow {
  return {
    id: row.id,
    apicHostId: row.apicHostId,
    dn: row.dn,
    name: row.name,
    tenant: row.tenant,
    appProfile: row.appProfile,
    description: row.description,
    bridgeDomain: row.bridgeDomain,
    pcTag: row.pcTag,
    preferredGroup: row.preferredGroup,
    isolation: row.isolation,
    domains: row.domains,
    providedContracts: row.providedContracts,
    consumedContracts: row.consumedContracts,
    bindings: row.bindings.map(serializeBinding),
  }
}

function serializeBindingWithEpg(binding: StoredEpgBindingWithEpg): EpgBindingWithEpg {
  return {
    ...serializeBinding(binding),
    epg: {
      name: binding.epg.name,
      tenant: binding.epg.tenant,
      appProfile: binding.epg.appProfile,
      dn: binding.epg.dn,
    },
  }
}

function normalize(filters: EpgFilters = {}): Required<EpgFilters> {
  const values = (items?: string[]) =>
    Array.from(new Set((items ?? []).map((item) => item.trim()).filter(Boolean))).sort(
      NATURAL_COLLATOR.compare,
    )
  return {
    query: filters.query?.trim() ?? '',
    tenant: values(filters.tenant),
    ap: values(filters.ap),
    node: values(filters.node),
  }
}

function filterParts(filters: Required<EpgFilters>): string[] {
  return [
    filters.query,
    JSON.stringify(filters.tenant),
    JSON.stringify(filters.ap),
    JSON.stringify(filters.node),
  ]
}

function nodeConditions(value: string): Prisma.EpgPathBindingWhereInput[] {
  return [
    { node: value },
    { node: { startsWith: `${value}-` } },
    { node: { endsWith: `-${value}` } },
  ]
}

export function buildEpgWhere(
  apicHostId: string,
  filters: EpgFilters,
): Prisma.EpgSnapshotWhereInput {
  const query = filters.query?.trim()
  return {
    apicHostId,
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tenant: { contains: query, mode: 'insensitive' } },
            { appProfile: { contains: query, mode: 'insensitive' } },
            { bridgeDomain: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

export function epgHasNodeBindingWhere(nodes: string[]): Prisma.EpgSnapshotWhereInput {
  return nodes.length ? { bindings: { some: { OR: nodes.flatMap(nodeConditions) } } } : {}
}

export function buildBindingWhere(
  apicHostId: string,
  filters: EpgFilters,
): Prisma.EpgPathBindingWhereInput {
  const query = filters.query?.trim()
  const epg = {
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
  }
  return {
    apicHostId,
    ...(Object.keys(epg).length ? { epg } : {}),
    ...(filters.node?.length ? { AND: [{ OR: filters.node.flatMap(nodeConditions) }] } : {}),
    ...(query
      ? {
          OR: [
            { node: { contains: query, mode: 'insensitive' } },
            { port: { contains: query, mode: 'insensitive' } },
            { encap: { contains: query, mode: 'insensitive' } },
            { epg: { name: { contains: query, mode: 'insensitive' } } },
            { epg: { tenant: { contains: query, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
}

export function countActiveEpgFilterGroups(filters: EpgFilters): number {
  return [filters.tenant, filters.ap, filters.node].filter((values) => values?.length).length
}
export function hasActiveEpgFilters(filters: EpgFilters): boolean {
  return Boolean(
    filters.query?.trim() || filters.tenant?.length || filters.ap?.length || filters.node?.length,
  )
}
export function expandNodeOptions(values: string[]): string[] {
  return Array.from(new Set(values.flatMap((value) => value.split('-')).filter(Boolean))).sort(
    NATURAL_COLLATOR.compare,
  )
}

async function resolveForRequest(requestedHostId: string): Promise<EpgHostResolution> {
  let hosts: Awaited<ReturnType<typeof getApicHosts>>
  try {
    hosts = await getApicHosts()
  } catch (error) {
    if (error instanceof ApicHostReadError && error.code === 'unauthorized') {
      throw new EpgReadError()
    }
    throw error instanceof ApicHostReadError ? (error.cause ?? error) : error
  }
  const options = hosts.map(({ id, name, host }) => ({ id, name, host }))
  if (!options.length) return { kind: 'empty', hosts: [] }
  const host = options.find((candidate) => candidate.id === requestedHostId)
  if (host) return { kind: 'selected', host, hosts: options }
  return {
    kind: 'redirect',
    location: `/epgs?apic=${encodeURIComponent(options[0].id)}`,
    hosts: options,
  }
}
export const resolveEpgHost = cache(resolveForRequest)

function pagination(total: number, requestedPage: number, pageSize: EpgPageSize): EpgPagination {
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))
  return {
    page: pageSize === 'all' ? 1 : Math.min(requestedPage, totalPages),
    pageSize,
    total,
    totalPages,
  }
}

export async function getEpgOverview(
  hostId: string,
  params: EpgPageParams,
): Promise<EpgOverviewData> {
  await authorize()
  const filters = normalize({
    query: params.query,
    tenant: params.tenants,
    ap: params.appProfiles,
    node: params.nodes,
  })
  return unstable_cache(
    async () => {
      const hostWhere = { apicHostId: hostId }
      const filteredWhere = {
        ...buildEpgWhere(hostId, filters),
        ...epgHasNodeBindingWhere(filters.node),
      }
      const [host, tenantRows, apRows, nodeRows, hostTotal, filteredTotal] = await Promise.all([
        prisma.apicHost.findFirst({ where: { id: hostId }, select: { lastEpgSyncAt: true } }),
        prisma.epgSnapshot.findMany({
          where: hostWhere,
          select: { tenant: true },
          distinct: ['tenant'],
          orderBy: { tenant: 'asc' },
        }),
        prisma.epgSnapshot.findMany({
          where: hostWhere,
          select: { appProfile: true },
          distinct: ['appProfile'],
          orderBy: { appProfile: 'asc' },
        }),
        prisma.epgPathBinding.findMany({
          where: hostWhere,
          select: { node: true },
          distinct: ['node'],
        }),
        prisma.epgSnapshot.count({ where: hostWhere }),
        prisma.epgSnapshot.count({ where: filteredWhere }),
      ])
      return {
        hostTotal,
        filteredTotal,
        lastEpgSyncAt: host?.lastEpgSyncAt?.toISOString() ?? null,
        choices: {
          tenants: Array.from(new Set(tenantRows.map((row) => row.tenant).filter(Boolean))).sort(
            NATURAL_COLLATOR.compare,
          ),
          appProfiles: Array.from(
            new Set(apRows.map((row) => row.appProfile).filter(Boolean)),
          ).sort(NATURAL_COLLATOR.compare),
          nodes: expandNodeOptions(nodeRows.map((row) => row.node).filter(Boolean)),
        },
      }
    },
    ['epgs', 'overview', hostId, ...filterParts(filters)],
    cacheOptions(hostId),
  )()
}

export async function getEpgResults(params: EpgPageParams): Promise<EpgResultsData> {
  await authorize()
  const filters = normalize({
    query: params.query,
    tenant: params.tenants,
    ap: params.appProfiles,
    node: params.nodes,
  })
  return unstable_cache(
    async (): Promise<EpgResultsData> => {
      if (params.view === 'port') {
        const bindings = await prisma.epgPathBinding.findMany({
          where: buildBindingWhere(params.hostId, filters),
          select: {
            ...BINDING_SELECT,
            epg: { select: { name: true, tenant: true, appProfile: true, dn: true } },
          },
        })
        const grouped = groupBindingsByPort(bindings.map(serializeBindingWithEpg))
        const page = pagination(grouped.length, params.page, params.pageSize)
        return {
          view: 'port',
          rows:
            params.pageSize === 'all'
              ? grouped
              : grouped.slice((page.page - 1) * params.pageSize, page.page * params.pageSize),
          pagination: page,
        }
      }
      const where = buildEpgWhere(params.hostId, filters)
      const total = await prisma.epgSnapshot.count({ where })
      const page = pagination(total, params.page, params.pageSize)
      const rows = await prisma.epgSnapshot.findMany({
        where,
        select: EPG_SELECT,
        orderBy: [{ tenant: 'asc' }, { name: 'asc' }],
        ...(params.pageSize === 'all'
          ? {}
          : { skip: (page.page - 1) * params.pageSize, take: params.pageSize }),
      })
      return { view: 'epg', rows: rows.map(serializeEpg), pagination: page }
    },
    [
      'epgs',
      'results',
      params.hostId,
      params.view,
      String(params.page),
      String(params.pageSize),
      ...filterParts(filters),
    ],
    cacheOptions(params.hostId),
  )()
}

function bindingMatchesNode(binding: { node: string }, nodes: string[]): boolean {
  const selected = new Set(nodes)
  return binding.node.split('-').some((node) => selected.has(node))
}

export async function getEpgExportData(selection: EpgExportSelection): Promise<EpgExportData> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    return { kind: 'unauthorized' }
  }
  const host = await prisma.apicHost.findFirst({
    where: { id: selection.hostId },
    select: { id: true, name: true, host: true },
  })
  if (!host) return { kind: 'host-not-found' }
  const filters = selection.scope === 'filtered' ? normalize(selection.filters) : normalize()
  const rows = await unstable_cache(
    async () => {
      let records = await prisma.epgSnapshot.findMany({
        where:
          selection.scope === 'all'
            ? { apicHostId: selection.hostId }
            : buildEpgWhere(selection.hostId, filters),
        select: EPG_SELECT,
        orderBy: [{ tenant: 'asc' }, { name: 'asc' }],
      })
      if (selection.scope === 'filtered' && filters.node.length) {
        records = records
          .map((row) => ({
            ...row,
            bindings: row.bindings.filter((binding) => bindingMatchesNode(binding, filters.node)),
          }))
          .filter((row) => row.bindings.length)
      }
      return records.map(serializeEpg)
    },
    ['epgs', 'export', selection.hostId, selection.scope, ...filterParts(filters)],
    cacheOptions(selection.hostId),
  )()
  return rows.length ? { kind: 'ready', host, rows } : { kind: 'empty', host }
}
