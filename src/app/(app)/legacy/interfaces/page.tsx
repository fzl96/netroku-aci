import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildLegacyInterfaceWhere,
  serializeLegacyInterfaceSample,
} from '@/lib/legacy-ui/interfaces'
import { LegacyInterfacesClient, type LegacyInterfaceRow } from './LegacyInterfacesClient'
import { sortLegacyInterfaceRows, sumLegacyCrcByInterface } from './list-data'
import { parseLegacyInterfaceListState } from './list-state'
import { queryLegacyStateChangedInterfaceIds } from './state-change-query'

export const metadata: Metadata = {
  title: 'Legacy Interfaces',
  description: 'Current legacy interface state, counters, and historical trends.',
}

interface PageParams {
  [key: string]: string | undefined
}

export default async function LegacyInterfacesPage({ searchParams }: { searchParams: Promise<PageParams> }) {
  if (!await getSession()) redirect('/signin')
  const state = parseLegacyInterfaceListState(await searchParams)
  const windowDays = state.window === '30d' ? 30 : 7
  const now = new Date()
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

  let crcTotals = new Map<string, bigint>()
  let interfaceIds: string[] | undefined

  if (state.view === 'crc') {
    const crcSamples = await prisma.legacyInterfaceSample.findMany({
      where: {
        collectedAt: { gte: windowStart },
        dCrcErrors: { gt: BigInt(0) },
      },
      select: { interfaceId: true, dCrcErrors: true },
    })
    crcTotals = sumLegacyCrcByInterface(crcSamples)
    interfaceIds = [...crcTotals.keys()]
  } else if (state.view === 'state-changed') {
    interfaceIds = await queryLegacyStateChangedInterfaceIds(
      sql => prisma.$queryRaw<Array<{ interfaceId: string }>>(sql),
      windowStart,
    )
  }

  const where = buildLegacyInterfaceWhere({
    query: state.query,
    deviceIds: state.deviceIds,
    interfaceIds,
    presence: 'present',
  })

  const [snapshots, allCount, downCount, absentCount, withHistory, devices] = await Promise.all([
    prisma.legacyInterfaceSnapshot.findMany({
      where,
      include: {
        device: { select: { id: true, hostname: true, site: true, managementIp: true } },
        samples: { orderBy: { collectedAt: 'desc' }, take: 1 },
      },
    }),
    prisma.legacyInterfaceSnapshot.count(),
    prisma.legacyInterfaceSnapshot.count({ where: { present: true, operSt: { equals: 'down', mode: 'insensitive' } } }),
    prisma.legacyInterfaceSnapshot.count({ where: { present: false } }),
    prisma.legacyInterfaceSnapshot.count({ where: { samples: { some: {} } } }),
    prisma.legacyDevice.findMany({ select: { id: true, hostname: true, site: true }, orderBy: { hostname: 'asc' } }),
  ])

  const allRows: LegacyInterfaceRow[] = snapshots.map(snapshot => ({
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
    crcWindowTotal: crcTotals.get(snapshot.id)?.toString() ?? null,
    sample: snapshot.samples[0] ? serializeLegacyInterfaceSample(snapshot.samples[0]) : null,
  }))
  const sortedRows = sortLegacyInterfaceRows(allRows, {
    key: state.sortKey,
    direction: state.sortDirection,
    mode: state.mode,
    view: state.view,
  })
  const total = sortedRows.length
  const start = (state.page - 1) * state.pageSize
  const rows = sortedRows.slice(start, start + state.pageSize)

  return <LegacyInterfacesClient
    rows={rows}
    total={total}
    page={state.page}
    pageSize={state.pageSize}
    filters={{
      query: state.query,
      site: '',
      device: state.deviceIds[0] ?? '',
      admin: '',
      oper: '',
      presence: 'present',
      counter: state.mode === 'delta' ? 'delta' : 'raw',
      sort: state.sortKey,
      dir: state.sortDirection,
    }}
    options={{ sites: [], devices, adminStates: [], operStates: [] }}
    summaries={{ total: allCount, down: downCount, absent: absentCount, withHistory }}
  />
}
