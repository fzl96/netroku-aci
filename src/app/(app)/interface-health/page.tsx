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

const USAGES_OF_INTEREST = ['epg', 'infra', 'discovery', '']

export default async function InterfaceHealthPage({
  searchParams,
}: {
  searchParams: Promise<{ apic?: string; query?: string; usage?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, usage } = await searchParams
  const apicHosts = await getApicHosts()

  // Filter: comma-separated usage list, default to "epg" (access ports) when not specified.
  const usageFilter = usage
    ? usage.split(',').map(s => s.trim()).filter(Boolean)
    : ['epg']

  let rows: InterfaceRowProps[] = []
  let lastSyncedAt: Date | null = null
  let availableUsages: string[] = USAGES_OF_INTEREST

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

    const snapshots = await prisma.interfaceSnapshot.findMany({
      where,
      orderBy: [{ node: 'asc' }, { ifName: 'asc' }],
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
    })

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

    // Available usage values for the filter chip, sourced from current data.
    const usages = await prisma.interfaceSnapshot.findMany({
      where: { apicHostId: apic },
      select: { usage: true },
      distinct: ['usage'],
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
    />
  )
}
