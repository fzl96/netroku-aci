import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { InterfaceHealthClient, type InterfaceRowProps } from './InterfaceHealthClient'
import type { CounterMode } from './counter-mode'
import { parseInterfaceSortParams, sortInterfaceRows } from './sort'
import { aggregateCrcTrend, type CrcTrendPoint } from './crc-trend'
import { sumCrcByInterface, sortByCrcWindowTotal } from './crc-window'
import { findStateChangedInterfaceIds, isRecentLinkStateChange } from './state-changes'

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
    view?: string
    window?: string
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
    view: viewParam,
    window: windowParam,
  } = await searchParams
  const apicHosts = await getApicHosts()

  if (!apic && apicHosts.length > 0) redirect(`/interface-health?apic=${apicHosts[0].id}`)

  const interfaceView: 'all' | 'crc' | 'state-changed' =
    viewParam === 'crc'
      ? 'crc'
      : viewParam === 'state-changed'
      ? 'state-changed'
      : 'all'

  const crcWindow: '7d' | '30d' = windowParam === '30d' ? '30d' : '7d'
  const windowDays = crcWindow === '30d' ? 30 : 7

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
  let crcTrend: CrcTrendPoint[] = []
  let crcTotalSortActive = false
  let crcSortDirection: 'asc' | 'desc' = 'desc'

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastInterfaceSyncAt: true },
    })
    lastSyncedAt = host?.lastInterfaceSyncAt ?? null

    const now = new Date()
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

    let crcInterfaceIds: string[] = []
    let crcTotals = new Map<string, bigint>()
    if (interfaceView === 'crc') {
      // One window fetch feeds both the aggregate trend chart and the
      // per-port windowed totals; the qualifying id set is just the map keys.
      const rawCrcSamples = await prisma.interfaceSample.findMany({
        where: {
          apicHostId: apic,
          sampledAt: { gte: windowStart },
          dRxCrcErrors: { gt: BigInt(0) },
        },
        select: { interfaceId: true, sampledAt: true, dRxCrcErrors: true },
        orderBy: { sampledAt: 'asc' },
      })
      crcTrend = aggregateCrcTrend(rawCrcSamples)
      crcTotals = sumCrcByInterface(rawCrcSamples)
      crcInterfaceIds = [...crcTotals.keys()]
    }

    let stateChangedInterfaceIds: string[] = []
    if (interfaceView === 'state-changed') {
      const windowStatusSamples = await prisma.interfaceSample.findMany({
        where: {
          apicHostId: apic,
          sampledAt: { gte: windowStart },
        },
        select: { interfaceId: true, sampledAt: true, adminSt: true, operSt: true },
      })
      stateChangedInterfaceIds = Array.from(findStateChangedInterfaceIds(windowStatusSamples))
    }

    const where = {
      apicHostId: apic,
      ...(interfaceView === 'crc' ? { id: { in: crcInterfaceIds } } : {}),
      ...(interfaceView === 'state-changed'
        ? {
            OR: [
              { lastLinkStChg: { gte: windowStart } },
              { id: { in: stateChangedInterfaceIds } },
            ],
          }
        : {}),
      ...(nodeFilter.length > 0 ? { node: { in: nodeFilter } } : {}),
      ...(query?.trim()
        ? {
            OR: [
              { ifName: { contains: query.trim(), mode: 'insensitive' as const } },
              { node: { contains: query.trim(), mode: 'insensitive' as const } },
              { description: { contains: query.trim(), mode: 'insensitive' as const } },
              { dn: { contains: query.trim(), mode: 'insensitive' as const } },
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

    // In the CRC view, absence of an explicit sample-column sort (or an
    // explicit crcWindowTotal sort) means rank by windowed CRC total desc.
    crcTotalSortActive =
      interfaceView === 'crc' &&
      (interfaceSort === null || sort === 'crcWindowTotal')
    crcSortDirection = dir === 'asc' ? 'asc' : 'desc'
    const sortedSnapshots = crcTotalSortActive
      ? sortByCrcWindowTotal(snapshots, crcTotals, crcSortDirection)
      : sortInterfaceRows(snapshots, interfaceSort ?? undefined)
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
        crcWindowTotal:
          interfaceView === 'crc'
            ? (crcTotals.get(s.id) ?? BigInt(0)).toString()
            : null,
        hasRecentStateChange: isRecentLinkStateChange(s.lastLinkStChg, windowStart),
      }
    })

    availableNodes = nodes.map(n => n.node).filter(n => n !== '').sort()
  }

  return (
    <InterfaceHealthClient
      rows={rows}
      selectedHostId={apic ?? ''}
      query={query ?? ''}
      filterNode={nodeFilter}
      availableNodes={availableNodes}
      lastSyncedAt={lastSyncedAt?.toISOString() ?? null}
      page={page}
      total={total}
      pageSize={pageSize}
      sortKey={crcTotalSortActive ? 'crcWindowTotal' : interfaceSort?.key ?? null}
      sortDirection={crcTotalSortActive ? crcSortDirection : interfaceSort?.direction ?? 'desc'}
      counterMode={counterMode}
      view={interfaceView}
      window={crcWindow}
      crcTrend={crcTrend}
    />
  )
}

