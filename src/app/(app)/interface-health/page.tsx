import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { InterfaceHealthClient, type InterfaceRowProps } from './InterfaceHealthClient'

export const metadata: Metadata = {
  title: 'Interface Health',
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
    usage?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, usage, page: pageParam, pageSize: pageSizeParam } = await searchParams
  const apicHosts = await getApicHosts()

  // Empty / missing usage param = show all roles. Comma-separated list otherwise.
  const usageFilter = usage
    ? usage.split(',').map(s => s.trim()).filter(Boolean)
    : []

  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let rows: InterfaceRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let availableUsages: string[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastInterfaceSyncAt: true },
    })
    lastSyncedAt = host?.lastInterfaceSyncAt ?? null

    const where = {
      apicHostId: apic,
      ...(usageFilter.length > 0 ? { usage: { in: usageFilter } } : {}),
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

    const [snapshots, snapshotTotal, usages] = await Promise.all([
      prisma.interfaceSnapshot.findMany({
        where,
        orderBy: [{ node: 'asc' }, { ifName: 'asc' }],
        skip,
        take,
        include: {
          samples: {
            orderBy: { sampledAt: 'desc' },
            take: 1,
            select: {
              sampledAt: true,
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
        select: { usage: true },
        distinct: ['usage'],
      }),
    ])

    total = snapshotTotal

    rows = snapshots.map((s) => {
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

    availableUsages = usages.map(u => u.usage).filter(u => u !== '').sort()
  }

  return (
    <InterfaceHealthClient
      apicHosts={apicHosts}
      rows={rows}
      selectedHostId={apic ?? ''}
      query={query ?? ''}
      filterUsage={usageFilter}
      availableUsages={availableUsages}
      lastSyncedAt={lastSyncedAt?.toISOString() ?? null}
      page={page}
      total={total}
      pageSize={pageSize}
    />
  )
}
