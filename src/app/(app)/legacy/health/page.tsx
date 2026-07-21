import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildLegacyHealthDeviceWhere, legacyHealthOrderBy, serializeLegacyHealthSample } from '@/lib/legacy-ui/health'
import { parseLegacyDirection, parseLegacyPage, parseLegacyPageSize } from '@/lib/legacy-ui/query'
import { LegacyHealthClient, type LegacyHealthRow } from './LegacyHealthClient'

export const metadata: Metadata = { title: 'Legacy Health', description: 'Latest and historical legacy-device health measurements.' }

export default async function LegacyHealthPage({ searchParams }: { searchParams: Promise<{ query?: string; site?: string; sort?: string; dir?: string; page?: string; pageSize?: string }> }) {
  if (!await getSession()) redirect('/signin')
  const params = await searchParams; const page = parseLegacyPage(params.page); const pageSize = parseLegacyPageSize(params.pageSize)
  const where = buildLegacyHealthDeviceWhere({ query: params.query, sites: params.site ? [params.site] : [] })
  const [devices, total, monitored, samples, logs, latest, siteOptions] = await Promise.all([
    prisma.legacyDevice.findMany({ where, orderBy: legacyHealthOrderBy(params.sort, parseLegacyDirection(params.dir)), skip: (page - 1) * pageSize, take: pageSize, select: { id: true, hostname: true, site: true, managementIp: true, healthSamples: { orderBy: { collectedAt: 'desc' }, take: 1 } } }),
    prisma.legacyDevice.count({ where }), prisma.legacyDevice.count({ where: { healthSamples: { some: {} } } }), prisma.legacyHealthSample.count(), prisma.legacyLogEntry.count(),
    prisma.legacyHealthSample.findFirst({ orderBy: { collectedAt: 'desc' }, select: { collectedAt: true } }),
    prisma.legacyDevice.findMany({ where: { healthSamples: { some: {} } }, distinct: ['site'], select: { site: true }, orderBy: { site: 'asc' } }),
  ])
  const rows: LegacyHealthRow[] = devices.flatMap(device => device.healthSamples[0] ? [{ deviceId: device.id, hostname: device.hostname, site: device.site, managementIp: device.managementIp, sample: serializeLegacyHealthSample(device.healthSamples[0]) }] : [])
  return <LegacyHealthClient rows={rows} total={total} page={page} pageSize={pageSize} query={params.query ?? ''} site={params.site ?? ''} sort={params.sort ?? 'collected'} dir={parseLegacyDirection(params.dir)} siteOptions={siteOptions.map(row => row.site)} summaries={{ devices: monitored, samples, logs, latest: latest?.collectedAt.toISOString() ?? null }} />
}
