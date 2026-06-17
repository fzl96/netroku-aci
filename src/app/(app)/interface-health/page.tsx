import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { InterfaceHealthClient, type InterfaceRowProps } from './InterfaceHealthClient'
import type { CounterMode } from './counter-mode'
import { parseInterfaceSortParams, sortInterfaceRows } from './sort'

export const metadata: Metadata = {
  title: 'Interfaces',
  description: 'Per-interface status, error, and utilisation counters resynced from APIC.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = typeof VALID_PAGE_SIZES[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

export default async function InterfaceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    node?: string
    page?: string
    pageSize?: string
    sort?: string
    dir?: string
    mode?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const {
    apic,
    query,
    node,
    page: pageParam,
    pageSize: pageSizeParam,
    sort,
    dir,
    mode,
  } = await searchParams
  const apicHosts = await getApicHosts()

  // Empty / missing node param = show all nodes. Comma-separated list otherwise.
  const nodeFilter = node
    ? node.split(',').map(s => s.trim()).filter(Boolean)
    : []

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)
  const counterMode: CounterMode = mode === 'current' ? 'current' : 'delta'
  const interfaceSort = parseInterfaceSortParams({ sort, dir, mode: counterMode })

  let rows: InterfaceRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let availableNodes: string[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastInterfaceSyncAt: true },
    })
    lastSyncedAt = host?.lastInterfaceSyncAt ?? null

    const where = {
      apicHostId: apic,
      ...(nodeFilter.length > 0 ? { node: { in: nodeFilter } } : {}),
      ...(query?.trim()
        ? {
            OR: [
              { ifName: { contains: query.trim() } },
              { node: { contains: query.trim() } },
              { description: { contains: query.trim() } },
              { dn: { contains: query.trim() } },
            ],
          }
        : {}),
    }

    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize

    const [snapshots, snapshotTotal, nodes] = await Promise.all([
      prisma.interfaceSnapshot.findMany({
        where,
        orderBy: [{ node: 'asc' }, { ifName: 'asc' }],
        include: {
          samples: {
            orderBy: { sampledAt: 'desc' },
            take: 1,
            select: {
              sampledAt: true,
              rxBytes: true, rxErrors: true,
              rxCrcErrors: true, rxAlignErrors: true,
              txBytes: true, txErrors: true,
              dRxBytes: true, dRxErrors: true, dRxDiscards: true,
              dRxCrcErrors: true, dRxAlignErrors: true,
              dTxBytes: true, dTxErrors: true, dTxDiscards: true,
            },
          },
        },
      }),
      prisma.interfaceSnapshot.count({ where }),
      prisma.interfaceSnapshot.findMany({
        where: { apicHostId: apic },
        select: { node: true },
        distinct: ['node'],
      }),
    ])

    total = snapshotTotal

    const sortedSnapshots = sortInterfaceRows(snapshots, interfaceSort ?? undefined)
    const visibleSnapshots = take === undefined
      ? sortedSnapshots
      : sortedSnapshots.slice(skip, skip + take)

    rows = visibleSnapshots.map((s) => {
      const latest = s.samples[0]
      return {
        id: s.id,
        node: s.node,
        ifName: s.ifName,
        dn: s.dn,
        usage: s.usage,
        adminSt: s.adminSt,
        operSt: s.operSt,
        operSpeed: s.operSpeed,
        description: s.description,
        lastLinkStChg: s.lastLinkStChg?.toISOString() ?? null,
        lastSampledAt: latest?.sampledAt.toISOString() ?? null,
        rxBytes: latest?.rxBytes.toString() ?? null,
        rxErrors: latest?.rxErrors.toString() ?? null,
        rxCrcErrors: latest?.rxCrcErrors.toString() ?? null,
        rxAlignErrors: latest?.rxAlignErrors.toString() ?? null,
        txBytes: latest?.txBytes.toString() ?? null,
        txErrors: latest?.txErrors.toString() ?? null,
        dRxBytes: latest?.dRxBytes?.toString() ?? null,
        dRxErrors: latest?.dRxErrors?.toString() ?? null,
        dRxDiscards: latest?.dRxDiscards?.toString() ?? null,
        dRxCrcErrors: latest?.dRxCrcErrors?.toString() ?? null,
        dRxAlignErrors: latest?.dRxAlignErrors?.toString() ?? null,
        dTxBytes: latest?.dTxBytes?.toString() ?? null,
        dTxErrors: latest?.dTxErrors?.toString() ?? null,
        dTxDiscards: latest?.dTxDiscards?.toString() ?? null,
      }
    })

    availableNodes = nodes.map(n => n.node).filter(n => n !== '').sort()
  }

  return (
    <InterfaceHealthClient
      apicHosts={apicHosts}
      rows={rows}
      selectedHostId={apic ?? ''}
      query={query ?? ''}
      filterNode={nodeFilter}
      availableNodes={availableNodes}
      lastSyncedAt={lastSyncedAt?.toISOString() ?? null}
      page={page}
      total={total}
      pageSize={pageSize}
      sortKey={interfaceSort?.key ?? null}
      sortDirection={interfaceSort?.direction ?? 'desc'}
      counterMode={counterMode}
    />
  )
}
