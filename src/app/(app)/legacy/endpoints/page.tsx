import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildLegacyEndpointWhere, legacyEndpointOrderBy, type LegacyEndpointStatus } from '@/lib/legacy-ui/endpoints'
import { parseLegacyDirection, parseLegacyPage, parseLegacyPageSize } from '@/lib/legacy-ui/query'
import { LegacyEndpointsClient, type LegacyEndpointRow } from './LegacyEndpointsClient'

export const metadata: Metadata = {
  title: 'Legacy Endpoints',
  description: 'Current and historical legacy endpoint placement.',
}

interface PageParams {
  query?: string
  site?: string
  device?: string
  vlan?: string
  interface?: string
  status?: string
  sort?: string
  dir?: string
  page?: string
  pageSize?: string
}

export default async function LegacyEndpointsPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  if (!await getSession()) redirect('/signin')
  const params = await searchParams
  const page = parseLegacyPage(params.page)
  const pageSize = parseLegacyPageSize(params.pageSize)
  const status = params.status === 'historical' ? 'historical' : params.status === 'all' ? 'all' : 'active'
  const statuses: LegacyEndpointStatus[] = status === 'all' ? ['active', 'historical'] : [status]
  const direction = parseLegacyDirection(params.dir)
  const where = buildLegacyEndpointWhere({
    query: params.query,
    sites: params.site ? [params.site] : [],
    deviceIds: params.device ? [params.device] : [],
    vlans: params.vlan ? [params.vlan] : [],
    interfaces: params.interface ? [params.interface] : [],
    statuses,
  })

  const [records, total, allCount, activeCount, historicalCount, devices, vlanRows, interfaceRows] = await Promise.all([
    prisma.legacyEndpoint.findMany({
      where,
      orderBy: legacyEndpointOrderBy(params.sort, direction),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { device: { select: { id: true, hostname: true, site: true, managementIp: true } } },
    }),
    prisma.legacyEndpoint.count({ where }),
    prisma.legacyEndpoint.count(),
    prisma.legacyEndpoint.count({ where: { isActive: true } }),
    prisma.legacyEndpoint.count({ where: { isActive: false } }),
    prisma.legacyDevice.findMany({ select: { id: true, hostname: true, site: true }, orderBy: { hostname: 'asc' } }),
    prisma.legacyEndpoint.findMany({ distinct: ['vlan'], select: { vlan: true }, orderBy: { vlan: 'asc' } }),
    prisma.legacyEndpoint.findMany({ distinct: ['interface'], select: { interface: true }, orderBy: { interface: 'asc' } }),
  ])

  const rows: LegacyEndpointRow[] = records.map(record => ({
    id: record.id,
    deviceId: record.deviceId,
    hostname: record.device.hostname,
    site: record.device.site,
    managementIp: record.device.managementIp,
    mac: record.mac,
    ip: record.ip,
    vlan: record.vlan,
    vlanName: record.vlanName,
    interface: record.interface,
    learningType: record.learningType,
    isActive: record.isActive,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastSeenAt: record.lastSeenAt.toISOString(),
    clearedAt: record.clearedAt?.toISOString() ?? null,
  }))
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

  return <LegacyEndpointsClient
    rows={rows}
    total={total}
    page={page}
    pageSize={pageSize}
    filters={{
      query: params.query ?? '', site: params.site ?? '', device: params.device ?? '',
      vlan: params.vlan ?? '', interface: params.interface ?? '', status,
      sort: params.sort ?? 'lastSeen', dir: direction,
    }}
    options={{
      sites: unique(devices.map(device => device.site)),
      devices,
      vlans: unique(vlanRows.map(row => row.vlan)),
      interfaces: unique(interfaceRows.map(row => row.interface)),
    }}
    summaries={{ total: allCount, active: activeCount, historical: historicalCount, vlans: vlanRows.length }}
  />
}
