import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type {
  EndpointFilters,
  EndpointPageParams,
  EndpointPageSize,
} from './params'
import {
  groupEndpointsByPort,
  type EndpointPortSummary,
} from './sort'

const ENDPOINT_CACHE_SECONDS = 8 * 60 * 60
const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const ENDPOINT_ROW_SELECT = {
  id: true,
  mac: true,
  ip: true,
  vlan: true,
  dn: true,
  node: true,
  interface: true,
  epgDescr: true,
  isActive: true,
  firstSeenAt: true,
  lastSeenAt: true,
  clearedAt: true,
} satisfies Prisma.EndpointSelect

type StoredEndpointRow = Prisma.EndpointGetPayload<{
  select: typeof ENDPOINT_ROW_SELECT
}>

export type EndpointHostOption = {
  id: string
  name: string
  host: string
}

export type EndpointHostResolution =
  | { kind: 'selected'; host: EndpointHostOption; hosts: EndpointHostOption[] }
  | { kind: 'redirect'; location: string; hosts: EndpointHostOption[] }
  | { kind: 'empty'; hosts: [] }

export type EndpointRow = Omit<
  StoredEndpointRow,
  'firstSeenAt' | 'lastSeenAt' | 'clearedAt'
> & {
  firstSeenAt: string
  lastSeenAt: string
  clearedAt: string | null
}

export type EndpointOverviewData = {
  activeTotal: number
  historicalTotal: number
  choices: {
    vlans: string[]
    nodes: string[]
    interfaces: string[]
  }
}

export type EndpointPagination = {
  page: number
  pageSize: EndpointPageSize
  total: number
  totalPages: number
}

export type EndpointResultsData =
  | { view: 'endpoint'; rows: EndpointRow[]; pagination: EndpointPagination }
  | {
      view: 'port'
      rows: EndpointPortSummary<EndpointRow>[]
      pagination: EndpointPagination
    }

export type EndpointExportSelection = {
  hostId: string
  scope: 'all' | 'filtered'
  filters?: EndpointFilters
}

export type EndpointExportData =
  | { kind: 'ready'; host: EndpointHostOption; rows: EndpointRow[] }
  | { kind: 'empty'; host: EndpointHostOption }
  | { kind: 'host-not-found' }
  | { kind: 'unauthorized' }

export class EndpointReadError extends Error {
  readonly code = 'unauthorized'

  constructor() {
    super('Unauthorized')
    this.name = 'EndpointReadError'
  }
}

function endpointCacheOptions(hostId: string) {
  return {
    tags: ['endpoints:all', `endpoints:host:${hostId}`],
    revalidate: ENDPOINT_CACHE_SECONDS,
  }
}

function serializeEndpoint(row: StoredEndpointRow): EndpointRow {
  return {
    id: row.id,
    mac: row.mac,
    ip: row.ip,
    vlan: row.vlan,
    dn: row.dn,
    node: row.node,
    interface: row.interface,
    epgDescr: row.epgDescr,
    isActive: row.isActive,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    clearedAt: row.clearedAt?.toISOString() ?? null,
  }
}

function pagination(total: number, requestedPage: number, pageSize: EndpointPageSize) {
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))
  return {
    page: pageSize === 'all' ? 1 : Math.min(requestedPage, totalPages),
    pageSize,
    total,
    totalPages,
  }
}

function normalizedFilters(filters: EndpointFilters = {}): EndpointFilters {
  const normalize = (values?: string[]) => values
    ? Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
      .sort(NATURAL_COLLATOR.compare)
    : []

  return {
    query: filters.query?.trim() ?? '',
    vlan: normalize(filters.vlan),
    node: normalize(filters.node),
    iface: normalize(filters.iface),
    status: filters.status?.length === 1 ? filters.status : [],
  }
}

function filterCacheParts(filters: EndpointFilters): string[] {
  return [
    filters.query ?? '',
    JSON.stringify(filters.vlan ?? []),
    JSON.stringify(filters.node ?? []),
    JSON.stringify(filters.iface ?? []),
    JSON.stringify(filters.status ?? []),
  ]
}

async function authorizeEndpointRead(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new EndpointReadError()
  }
}

/** OR-conditions matching an exact node or either member of a vPC pair. */
function nodeConditions(value: string): Prisma.EndpointWhereInput[] {
  return [
    { node: value },
    { node: { startsWith: `${value}-` } },
    { node: { endsWith: `-${value}` } },
  ]
}

export function buildEndpointWhere(
  apicHostId: string,
  filters: EndpointFilters,
): Prisma.EndpointWhereInput {
  const query = filters.query?.trim()

  return {
    apicHostId,
    ...(filters.vlan?.length ? { vlan: { in: filters.vlan } } : {}),
    ...(filters.node?.length
      ? { AND: [{ OR: filters.node.flatMap(nodeConditions) }] }
      : {}),
    ...(filters.iface?.length ? { interface: { in: filters.iface } } : {}),
    ...(filters.status?.length === 1 ? { isActive: filters.status[0] === 'active' } : {}),
    ...(query
      ? {
          OR: [
            { mac: { contains: query, mode: 'insensitive' } },
            { ip: { contains: query, mode: 'insensitive' } },
            { vlan: { contains: query, mode: 'insensitive' } },
            { node: { contains: query, mode: 'insensitive' } },
            { interface: { contains: query, mode: 'insensitive' } },
            { epgDescr: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

/** Distinct stored node values ("3101", "3101-3102") → individual leaf options ("3101", "3102"). */
export function expandNodeOptions(values: string[]): string[] {
  const leaves = new Set<string>()
  for (const value of values) {
    for (const leaf of value.split('-')) {
      if (leaf) leaves.add(leaf)
    }
  }
  return Array.from(leaves).sort((a, b) => NATURAL_COLLATOR.compare(a, b))
}

async function resolveEndpointHostForRequest(
  requestedHostId: string,
): Promise<EndpointHostResolution> {
  await authorizeEndpointRead()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, host: true },
  })

  if (hosts.length === 0) return { kind: 'empty', hosts: [] }

  const host = hosts.find(candidate => candidate.id === requestedHostId)
  if (host) return { kind: 'selected', host, hosts }

  return {
    kind: 'redirect',
    location: `/endpoints?apic=${encodeURIComponent(hosts[0].id)}`,
    hosts,
  }
}

/** Authenticated, request-deduplicated host resolution for the Endpoints shell. */
export const resolveEndpointHost = cache(resolveEndpointHostForRequest)

export async function getEndpointOverview(hostId: string): Promise<EndpointOverviewData> {
  await authorizeEndpointRead()

  return unstable_cache(
    async () => {
      const hostWhere = { apicHostId: hostId }
      const [activeTotal, historicalTotal, vlanRows, nodeRows, interfaceRows] = await Promise.all([
        prisma.endpoint.count({ where: { ...hostWhere, isActive: true } }),
        prisma.endpoint.count({ where: { ...hostWhere, isActive: false } }),
        prisma.endpoint.findMany({
          where: hostWhere,
          select: { vlan: true },
          distinct: ['vlan'],
          orderBy: { vlan: 'asc' },
        }),
        prisma.endpoint.findMany({
          where: hostWhere,
          select: { node: true },
          distinct: ['node'],
        }),
        prisma.endpoint.findMany({
          where: hostWhere,
          select: { interface: true },
          distinct: ['interface'],
          orderBy: { interface: 'asc' },
        }),
      ])

      return {
        activeTotal,
        historicalTotal,
        choices: {
          vlans: vlanRows.map(row => row.vlan).filter(Boolean),
          nodes: expandNodeOptions(nodeRows.map(row => row.node).filter(Boolean)),
          interfaces: interfaceRows.map(row => row.interface).filter(Boolean),
        },
      }
    },
    ['endpoints', 'overview', hostId],
    endpointCacheOptions(hostId),
  )()
}

export async function getEndpointResults(
  params: EndpointPageParams,
): Promise<EndpointResultsData> {
  await authorizeEndpointRead()
  const filters = normalizedFilters({
    query: params.query,
    vlan: params.vlans,
    node: params.nodes,
    iface: params.view === 'endpoint' ? params.interfaces : [],
    status: params.statuses,
  })

  return unstable_cache(
    async (): Promise<EndpointResultsData> => {
      const where = buildEndpointWhere(params.hostId, filters)

      if (params.view === 'port') {
        const storedRows = await prisma.endpoint.findMany({
          where,
          select: ENDPOINT_ROW_SELECT,
          orderBy: { lastSeenAt: 'desc' },
        })
        const rows = groupEndpointsByPort(storedRows.map(serializeEndpoint))
        const page = pagination(rows.length, params.page, params.pageSize)
        const visibleRows = params.pageSize === 'all'
          ? rows
          : rows.slice((page.page - 1) * params.pageSize, page.page * params.pageSize)

        return { view: 'port', rows: visibleRows, pagination: page }
      }

      const total = await prisma.endpoint.count({ where })
      const page = pagination(total, params.page, params.pageSize)
      const storedRows = await prisma.endpoint.findMany({
        where,
        select: ENDPOINT_ROW_SELECT,
        orderBy: { lastSeenAt: 'desc' },
        ...(params.pageSize === 'all'
          ? {}
          : { skip: (page.page - 1) * params.pageSize, take: params.pageSize }),
      })

      return {
        view: 'endpoint',
        rows: storedRows.map(serializeEndpoint),
        pagination: page,
      }
    },
    [
      'endpoints',
      'results',
      params.hostId,
      params.view,
      filters.query ?? '',
      String(params.page),
      String(params.pageSize),
      JSON.stringify(filters.vlan ?? []),
      JSON.stringify(filters.node ?? []),
      JSON.stringify(filters.iface ?? []),
      JSON.stringify(filters.status ?? []),
    ],
    endpointCacheOptions(params.hostId),
  )()
}

export async function getEndpointExportData(
  selection: EndpointExportSelection,
): Promise<EndpointExportData> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    return { kind: 'unauthorized' }
  }
  const filters = selection.scope === 'filtered'
    ? normalizedFilters(selection.filters)
    : normalizedFilters()

  const host = await prisma.apicHost.findFirst({
    where: { id: selection.hostId },
    select: { id: true, name: true, host: true },
  })
  if (!host) return { kind: 'host-not-found' }

  const storedRows = await unstable_cache(
    async () => prisma.endpoint.findMany({
      where: selection.scope === 'all'
        ? { apicHostId: selection.hostId }
        : buildEndpointWhere(selection.hostId, filters),
      select: ENDPOINT_ROW_SELECT,
      orderBy: { lastSeenAt: 'desc' },
    }),
    [
      'endpoints',
      'export',
      selection.hostId,
      selection.scope,
      ...filterCacheParts(filters),
    ],
    endpointCacheOptions(selection.hostId),
  )()

  if (storedRows.length === 0) return { kind: 'empty', host }
  return { kind: 'ready', host, rows: storedRows.map(serializeEndpoint) }
}
