import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { FaultsClient, type FaultRowProps } from './FaultsClient'
import { sortFaultRows } from './sort'

export const metadata: Metadata = {
  title: 'Faults',
  description: 'Active Cisco ACI fabric faults resynced from APIC, with severity trend.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_SEVERITIES = ['critical', 'major', 'minor', 'warning'] as const

export default async function FaultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    severity?: string
    node?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { apic, query, severity, node, page: pageParam, pageSize: pageSizeParam } =
    await searchParams
  const apicHosts = await getApicHosts()

  const severityFilter = (VALID_SEVERITIES as readonly string[]).includes(severity ?? '')
    ? (severity as string)
    : undefined
  const nodeFilter = node ? node.split(',').map(s => s.trim()).filter(Boolean) : []
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let rows: FaultRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let availableNodes: string[] = []
  let trend: { sampledAt: string; critical: number; major: number; minor: number; warning: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastFaultSyncAt: true },
    })
    lastSyncedAt = host?.lastFaultSyncAt ?? null

    const where = {
      apicHostId: apic,
      lifecycle: 'active',
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(nodeFilter.length > 0 ? { node: { in: nodeFilter } } : {}),
      ...(query?.trim()
        ? {
            OR: [
              { code: { contains: query.trim(), mode: 'insensitive' as const } },
              { descr: { contains: query.trim(), mode: 'insensitive' as const } },
              { affectedDn: { contains: query.trim(), mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    total = await prisma.faultSnapshot.count({ where })

    const records = await prisma.faultSnapshot.findMany({
      where,
      ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    })
    rows = sortFaultRows(
      records.map(r => ({
        id: r.id,
        code: r.code,
        severity: r.severity,
        domain: r.domain,
        type: r.type,
        affectedDn: r.affectedDn,
        node: r.node,
        descr: r.descr,
        ack: r.ack,
        created: r.created ? r.created.toISOString() : null,
      })),
    )

    const nodes = await prisma.faultSnapshot.findMany({
      where: { apicHostId: apic, lifecycle: 'active', node: { not: null } },
      distinct: ['node'],
      select: { node: true },
    })
    availableNodes = nodes.map(n => n.node!).filter(Boolean)

    const samples = await prisma.faultCountSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, critical: true, major: true, minor: true, warning: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        critical: s.critical,
        major: s.major,
        minor: s.minor,
        warning: s.warning,
      }))
  }

  return (
    <FaultsClient
      selectedApic={apic ?? null}
      query={query ?? ''}
      severity={severityFilter ?? null}
      nodeFilter={nodeFilter}
      availableNodes={availableNodes}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      trend={trend}
    />
  )
}
