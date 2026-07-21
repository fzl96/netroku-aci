import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildLegacyInterfaceWhere, serializeLegacyInterfaceSample, type LegacyInterfacePresence } from '@/lib/legacy-ui/interfaces'
import { parseLegacyPage, parseLegacyPageSize } from '@/lib/legacy-ui/query'
import { LegacyInterfacesClient, type LegacyInterfaceRow } from './LegacyInterfacesClient'

export const metadata: Metadata = {
  title: 'Legacy Interfaces',
  description: 'Current legacy interface state, counters, and historical trends.',
}

interface PageParams {
  query?: string
  site?: string
  device?: string
  admin?: string
  oper?: string
  presence?: string
  page?: string
  pageSize?: string
}

export default async function LegacyInterfacesPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  if (!await getSession()) redirect('/signin')
  const params = await searchParams
  const page = parseLegacyPage(params.page)
  const pageSize = parseLegacyPageSize(params.pageSize)
  const presence: LegacyInterfacePresence = params.presence === 'absent'
    ? 'absent'
    : params.presence === 'all' ? 'all' : 'present'
  const where = buildLegacyInterfaceWhere({
    query: params.query,
    sites: params.site ? [params.site] : [],
    deviceIds: params.device ? [params.device] : [],
    adminStates: params.admin ? [params.admin] : [],
    operStates: params.oper ? [params.oper] : [],
    presence,
  })

  const [snapshots, total, allCount, downCount, absentCount, withHistory, devices, stateRows] = await Promise.all([
    prisma.legacyInterfaceSnapshot.findMany({
      where,
      orderBy: [{ device: { hostname: 'asc' } }, { ifName: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        device: { select: { id: true, hostname: true, site: true, managementIp: true } },
        samples: { orderBy: { collectedAt: 'desc' }, take: 1 },
      },
    }),
    prisma.legacyInterfaceSnapshot.count({ where }),
    prisma.legacyInterfaceSnapshot.count(),
    prisma.legacyInterfaceSnapshot.count({ where: { present: true, operSt: { equals: 'down', mode: 'insensitive' } } }),
    prisma.legacyInterfaceSnapshot.count({ where: { present: false } }),
    prisma.legacyInterfaceSnapshot.count({ where: { samples: { some: {} } } }),
    prisma.legacyDevice.findMany({ select: { id: true, hostname: true, site: true }, orderBy: { hostname: 'asc' } }),
    prisma.legacyInterfaceSnapshot.findMany({ select: { adminSt: true, operSt: true } }),
  ])

  const rows: LegacyInterfaceRow[] = snapshots.map(snapshot => ({
    id: snapshot.id,
    deviceId: snapshot.deviceId,
    hostname: snapshot.device.hostname,
    site: snapshot.device.site,
    managementIp: snapshot.device.managementIp,
    ifName: snapshot.ifName,
    description: snapshot.description,
    ipAddress: snapshot.ipAddress,
    prefixLength: snapshot.prefixLength,
    mtu: snapshot.mtu,
    speed: snapshot.speed,
    adminSt: snapshot.adminSt,
    operSt: snapshot.operSt,
    present: snapshot.present,
    firstSeenAt: snapshot.firstSeenAt.toISOString(),
    lastSeenAt: snapshot.lastSeenAt.toISOString(),
    sample: snapshot.samples[0] ? serializeLegacyInterfaceSample(snapshot.samples[0]) : null,
  }))

  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))

  return <LegacyInterfacesClient
    rows={rows}
    total={total}
    page={page}
    pageSize={pageSize}
    filters={{
      query: params.query ?? '', site: params.site ?? '', device: params.device ?? '',
      admin: params.admin ?? '', oper: params.oper ?? '', presence,
    }}
    options={{
      sites: unique(devices.map(device => device.site)),
      devices,
      adminStates: unique(stateRows.map(row => row.adminSt)),
      operStates: unique(stateRows.map(row => row.operSt)),
    }}
    summaries={{ total: allCount, down: downCount, absent: absentCount, withHistory }}
  />
}
