import 'server-only'

import type { Prisma } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { NodePageParams, NodePageSize } from './params'
import { sortComponentRows, sortNodeRows } from './sort'

const NODE_CACHE_SECONDS = 28_800

const NODE_SELECT = {
  id: true,
  nodeId: true,
  name: true,
  role: true,
  model: true,
  version: true,
  fabricSt: true,
  state: true,
  uptime: true,
} satisfies Prisma.NodeSnapshotSelect
const COMPONENT_SELECT = {
  id: true,
  nodeId: true,
  type: true,
  name: true,
  operSt: true,
  healthy: true,
  model: true,
} satisfies Prisma.HardwareComponentSelect

type StoredNode = Prisma.NodeSnapshotGetPayload<{ select: typeof NODE_SELECT }>
type StoredComponent = Prisma.HardwareComponentGetPayload<{ select: typeof COMPONENT_SELECT }>
type ComponentCount = { nodeId: string; type: string; healthy: boolean; _count: { _all: number } }

export type NodeHostOption = { id: string; name: string; host: string }
export type NodeHostResolution =
  | { kind: 'selected'; host: NodeHostOption; hosts: NodeHostOption[] }
  | { kind: 'redirect'; location: string; hosts: NodeHostOption[] }
  | { kind: 'empty'; hosts: [] }
export type NodeComponentCount = { ok: number; total: number }
export type NodeRow = {
  id: string
  nodeId: string
  name: string
  role: string
  model: string
  version: string | null
  fabricSt: string
  state: string | null
  uptime: string | null
  psu: NodeComponentCount
  fan: NodeComponentCount
}
export type HardwareComponentRow = {
  id: string
  nodeId: string
  type: string
  name: string
  operSt: string
  healthy: boolean
  model: string
}
export type NodeOverviewData = {
  lastNodeSyncAt: string | null
  nodesOnline: number
  nodesTotal: number
  componentsFailed: number
}
export type NodeTrendPoint = { sampledAt: string; nodesOnline: number; componentsFailed: number }
export type NodePagination = {
  page: number
  pageSize: NodePageSize
  total: number
  totalPages: number
}
export type NodeResultsData =
  | { view: 'nodes'; rows: NodeRow[]; pagination: NodePagination }
  | { view: 'components'; rows: HardwareComponentRow[]; pagination: NodePagination }

export type NodeReadErrorCode = 'unauthorized' | 'read-failed'

export class NodeReadError extends Error {
  constructor(
    readonly code: NodeReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load node data', options)
    this.name = 'NodeReadError'
  }
}

async function authorize(): Promise<void> {
  try {
    await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new NodeReadError()
  }
}

async function readNodeData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof NodeReadError) throw error
    throw new NodeReadError('read-failed', { cause: error })
  }
}

function cacheOptions(hostId: string) {
  return { tags: ['nodes:all', `nodes:host:${hostId}`], revalidate: NODE_CACHE_SECONDS }
}

async function resolveForRequest(requestedHostId: string): Promise<NodeHostResolution> {
  await authorize()
  return readNodeData(async () => {
    const hosts = await prisma.apicHost.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, host: true },
    })
    if (!hosts.length) return { kind: 'empty', hosts: [] }
    const host = hosts.find((candidate) => candidate.id === requestedHostId)
    if (host) return { kind: 'selected', host, hosts }
    return { kind: 'redirect', location: `/nodes?apic=${encodeURIComponent(hosts[0].id)}`, hosts }
  })
}
export const resolveNodeHost = cache(resolveForRequest)

export async function getNodeOverview(hostId: string): Promise<NodeOverviewData> {
  await authorize()
  return readNodeData(() =>
    unstable_cache(
      async () => {
        const [host, nodesTotal, nodesOnline, componentsFailed] = await Promise.all([
          prisma.apicHost.findFirst({ where: { id: hostId }, select: { lastNodeSyncAt: true } }),
          prisma.nodeSnapshot.count({ where: { apicHostId: hostId, present: true } }),
          prisma.nodeSnapshot.count({
            where: {
              apicHostId: hostId,
              present: true,
              OR: [{ fabricSt: 'active' }, { role: 'controller', state: 'in-service' }],
            },
          }),
          prisma.hardwareComponent.count({
            where: { apicHostId: hostId, present: true, healthy: false },
          }),
        ])
        return {
          lastNodeSyncAt: host?.lastNodeSyncAt?.toISOString() ?? null,
          nodesOnline,
          nodesTotal,
          componentsFailed,
        }
      },
      ['nodes', 'overview', hostId],
      cacheOptions(hostId),
    )(),
  )
}

export async function getNodeTrend(hostId: string): Promise<NodeTrendPoint[]> {
  await authorize()
  return readNodeData(() =>
    unstable_cache(
      async () => {
        const samples = await prisma.nodeStatusSample.findMany({
          where: { apicHostId: hostId },
          orderBy: { sampledAt: 'desc' },
          take: 100,
          select: { sampledAt: true, nodesOnline: true, componentsFailed: true },
        })
        return samples.reverse().map((sample) => ({
          sampledAt: sample.sampledAt.toISOString(),
          nodesOnline: sample.nodesOnline,
          componentsFailed: sample.componentsFailed,
        }))
      },
      ['nodes', 'trend', hostId],
      cacheOptions(hostId),
    )(),
  )
}

function pagination(total: number, requestedPage: number, pageSize: NodePageSize): NodePagination {
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))
  return {
    page: pageSize === 'all' ? 1 : Math.min(requestedPage, totalPages),
    pageSize,
    total,
    totalPages,
  }
}

function pageRows<T>(rows: T[], pagination: NodePagination): T[] {
  if (pagination.pageSize === 'all') return rows
  const start = (pagination.page - 1) * pagination.pageSize
  return rows.slice(start, start + pagination.pageSize)
}

function countsFor(rows: ComponentCount[], nodeId: string, type: string): NodeComponentCount {
  const matching = rows.filter((row) => row.nodeId === nodeId && row.type === type)
  return {
    ok: matching.filter((row) => row.healthy).reduce((sum, row) => sum + row._count._all, 0),
    total: matching.reduce((sum, row) => sum + row._count._all, 0),
  }
}

function serializeNode(row: StoredNode, counts: ComponentCount[]): NodeRow {
  return {
    id: row.id,
    nodeId: row.nodeId,
    name: row.name,
    role: row.role,
    model: row.model,
    version: row.version,
    fabricSt: row.fabricSt,
    state: row.state,
    uptime: row.uptime,
    psu: countsFor(counts, row.nodeId, 'psu'),
    fan: countsFor(counts, row.nodeId, 'fan'),
  }
}

function serializeComponent(row: StoredComponent): HardwareComponentRow {
  return {
    id: row.id,
    nodeId: row.nodeId,
    type: row.type,
    name: row.name,
    operSt: row.operSt,
    healthy: row.healthy,
    model: row.model,
  }
}

function normalizedKey(params: NodePageParams): string[] {
  return [params.hostId, params.view, params.query, params.role ?? '', params.componentType ?? '']
}

export async function getNodeResults(params: NodePageParams): Promise<NodeResultsData> {
  await authorize()
  const query = params.query.trim()
  const stored = await readNodeData(() =>
    unstable_cache(
      async (): Promise<
        { view: 'nodes'; rows: NodeRow[] } | { view: 'components'; rows: HardwareComponentRow[] }
      > => {
        if (params.view === 'components') {
          const where: Prisma.HardwareComponentWhereInput = {
            apicHostId: params.hostId,
            present: true,
            ...(params.componentType ? { type: params.componentType } : {}),
            ...(query
              ? {
                  OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { nodeId: { contains: query, mode: 'insensitive' } },
                    { dn: { contains: query, mode: 'insensitive' } },
                  ],
                }
              : {}),
          }
          const rows = await prisma.hardwareComponent.findMany({ where, select: COMPONENT_SELECT })
          return { view: 'components', rows: sortComponentRows(rows.map(serializeComponent)) }
        }
        const where: Prisma.NodeSnapshotWhereInput = {
          apicHostId: params.hostId,
          present: true,
          ...(params.role ? { role: params.role } : {}),
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: 'insensitive' } },
                  { nodeId: { contains: query, mode: 'insensitive' } },
                ],
              }
            : {}),
        }
        const records = await prisma.nodeSnapshot.findMany({ where, select: NODE_SELECT })
        const counts = records.length
          ? await prisma.hardwareComponent.groupBy({
              by: ['nodeId', 'type', 'healthy'],
              where: {
                apicHostId: params.hostId,
                present: true,
                nodeId: { in: records.map((row) => row.nodeId) },
              },
              _count: { _all: true },
            })
          : []
        return {
          view: 'nodes',
          rows: sortNodeRows(records.map((row) => serializeNode(row, counts))),
        }
      },
      ['nodes', 'results', ...normalizedKey(params)],
      cacheOptions(params.hostId),
    )(),
  )

  const paging = pagination(stored.rows.length, params.page, params.pageSize)
  return stored.view === 'nodes'
    ? { view: 'nodes', rows: pageRows(stored.rows, paging), pagination: paging }
    : { view: 'components', rows: pageRows(stored.rows, paging), pagination: paging }
}
