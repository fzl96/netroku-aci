import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildLegacyDeviceWhere, legacyDeviceOrderBy } from '@/lib/legacy-ui/devices'
import { parseLegacyDirection, parseLegacyPage, parseLegacyPageSize } from '@/lib/legacy-ui/query'
import { serializeLegacyDate } from '@/lib/legacy-ui/serialize'
import { LegacyDevicesClient, type LegacyDeviceRow } from './LegacyDevicesClient'

export const metadata: Metadata = { title: 'Legacy Devices', description: 'Legacy network-device inventory and collection freshness.' }

export default async function LegacyDevicesPage({ searchParams }: { searchParams: Promise<{ query?: string; site?: string; deviceType?: string; sort?: string; dir?: string; page?: string; pageSize?: string }> }) {
  if (!await getSession()) redirect('/signin')
  const params = await searchParams
  const page = parseLegacyPage(params.page)
  const pageSize = parseLegacyPageSize(params.pageSize)
  const sites = params.site ? [params.site] : []
  const deviceTypes = params.deviceType ? [params.deviceType] : []
  const where = buildLegacyDeviceWhere({ query: params.query, sites, deviceTypes })
  const orderBy = legacyDeviceOrderBy(params.sort, parseLegacyDirection(params.dir))

  const [records, total, totalDevices, siteRows, withHealth, incomplete, siteOptions, typeOptions] = await Promise.all([
    prisma.legacyDevice.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.legacyDevice.count({ where }),
    prisma.legacyDevice.count(),
    prisma.legacyDevice.findMany({ distinct: ['site'], select: { site: true } }),
    prisma.legacyDevice.count({ where: { lastHealthSyncAt: { not: null } } }),
    prisma.legacyDevice.count({ where: { OR: [{ lastHealthSyncAt: null }, { lastInterfaceSyncAt: null }, { lastEndpointSyncAt: null }] } }),
    prisma.legacyDevice.findMany({ distinct: ['site'], select: { site: true }, orderBy: { site: 'asc' } }),
    prisma.legacyDevice.findMany({ distinct: ['deviceType'], select: { deviceType: true }, orderBy: { deviceType: 'asc' } }),
  ])

  const rows: LegacyDeviceRow[] = records.map(record => ({
    id: record.id, site: record.site, hostname: record.hostname,
    managementIp: record.managementIp, deviceType: record.deviceType,
    vendor: record.vendor, model: record.model, serialNumber: record.serialNumber,
    softwareVersion: record.softwareVersion, location: record.location, active: record.active,
    firstSeenAt: record.firstSeenAt.toISOString(), lastSeenAt: record.lastSeenAt.toISOString(),
    lastHealthSyncAt: serializeLegacyDate(record.lastHealthSyncAt),
    lastInterfaceSyncAt: serializeLegacyDate(record.lastInterfaceSyncAt),
    lastEndpointSyncAt: serializeLegacyDate(record.lastEndpointSyncAt),
  }))

  return <LegacyDevicesClient rows={rows} total={total} page={page} pageSize={pageSize} query={params.query ?? ''} site={params.site ?? ''} deviceType={params.deviceType ?? ''} siteOptions={siteOptions.map(row => row.site)} typeOptions={typeOptions.map(row => row.deviceType)} summaries={{ total: totalDevices, sites: siteRows.length, withHealth, incomplete }} />
}
