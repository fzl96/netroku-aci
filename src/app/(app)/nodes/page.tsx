import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { NodesClient, type ComponentRowProps, type NodeRowProps } from './NodesClient'
import { sortComponentRows, sortNodeRows } from './sort'

export const metadata: Metadata = {
  title: 'Nodes',
  description: 'Cisco ACI fabric node inventory and PSU/fan hardware health resynced from APIC.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_ROLES = ['leaf', 'spine', 'controller'] as const
const VALID_TYPES = ['psu', 'fan'] as const

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    view?: string
    role?: string
    type?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { apic, query, view: viewParam, role, type, page: pageParam, pageSize: pageSizeParam } =
    await searchParams
  const apicHosts = await getApicHosts()

  const view = viewParam === 'components' ? 'components' : 'nodes'
  const roleFilter = (VALID_ROLES as readonly string[]).includes(role ?? '') ? (role as string) : undefined
  const typeFilter = (VALID_TYPES as readonly string[]).includes(type ?? '') ? (type as string) : undefined
  const trimmedQuery = query?.trim() ?? ''
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let nodeRows: NodeRowProps[] = []
  let componentRows: ComponentRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let nodesOnline = 0
  let nodesTotal = 0
  let componentsFailed = 0
  let trend: { sampledAt: string; nodesOnline: number; componentsFailed: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastNodeSyncAt: true },
    })
    lastSyncedAt = host?.lastNodeSyncAt ?? null

    nodesTotal = await prisma.nodeSnapshot.count({ where: { apicHostId: apic, present: true } })
    nodesOnline = await prisma.nodeSnapshot.count({
      where: {
        apicHostId: apic,
        present: true,
        OR: [
          { fabricSt: 'active' },
          { role: 'controller', state: 'in-service' },
        ],
      },
    })
    componentsFailed = await prisma.hardwareComponent.count({
      where: { apicHostId: apic, present: true, healthy: false },
    })

    if (view === 'components') {
      const where = {
        apicHostId: apic,
        present: true,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
                { nodeId: { contains: trimmedQuery, mode: 'insensitive' as const } },
                { dn: { contains: trimmedQuery, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      }
      total = await prisma.hardwareComponent.count({ where })
      const records = await prisma.hardwareComponent.findMany({
        where,
        ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      })
      componentRows = sortComponentRows(
        records.map(r => ({
          id: r.id,
          nodeId: r.nodeId,
          type: r.type,
          name: r.name,
          operSt: r.operSt,
          healthy: r.healthy,
          model: r.model,
        })),
      )
    } else {
      const where = {
        apicHostId: apic,
        present: true,
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: 'insensitive' as const } },
                { nodeId: { contains: trimmedQuery, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      }
      total = await prisma.nodeSnapshot.count({ where })
      const records = await prisma.nodeSnapshot.findMany({
        where,
        ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      })
      const nodeIds = records.map(r => r.nodeId)
      const compCounts = await prisma.hardwareComponent.groupBy({
        by: ['nodeId', 'type', 'healthy'],
        where: { apicHostId: apic, present: true, nodeId: { in: nodeIds } },
        _count: { _all: true },
      })
      const countFor = (nodeId: string, componentType: string) => {
        const rows = compCounts.filter(c => c.nodeId === nodeId && c.type === componentType)
        const totalCount = rows.reduce((sum, c) => sum + c._count._all, 0)
        const okCount = rows.filter(c => c.healthy).reduce((sum, c) => sum + c._count._all, 0)
        return { ok: okCount, total: totalCount }
      }
      nodeRows = sortNodeRows(
        records.map(r => ({
          id: r.id,
          nodeId: r.nodeId,
          name: r.name,
          role: r.role,
          model: r.model,
          version: r.version,
          fabricSt: r.fabricSt,
          state: r.state,
          uptime: r.uptime,
          psu: countFor(r.nodeId, 'psu'),
          fan: countFor(r.nodeId, 'fan'),
        })),
      )
    }

    const samples = await prisma.nodeStatusSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, nodesOnline: true, componentsFailed: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        nodesOnline: s.nodesOnline,
        componentsFailed: s.componentsFailed,
      }))
  }

  return (
    <NodesClient
      selectedApic={apic ?? null}
      query={query ?? ''}
      view={view}
      role={roleFilter ?? null}
      type={typeFilter ?? null}
      nodeRows={nodeRows}
      componentRows={componentRows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      nodesOnline={nodesOnline}
      nodesTotal={nodesTotal}
      componentsFailed={componentsFailed}
      trend={trend}
    />
  )
}
