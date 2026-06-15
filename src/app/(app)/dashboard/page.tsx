import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  IconActivity,
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheck,
  IconCircleFilled,
  IconDatabase,
  IconDeviceDesktopSearch,
  IconPlugConnected,
  IconRouter,
  IconServer2,
} from '@tabler/icons-react'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  buildAttentionItems,
  classifyPosture,
  formatRelativeFreshness,
  summarizeInterfaces,
  type PostureTone,
} from './summary'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Global Netroku ACI operations dashboard.',
}

type Severity = 'critical' | 'major' | 'minor' | 'warning'

const SEVERITIES: Severity[] = ['critical', 'major', 'minor', 'warning']

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatScore(value: number | null): string {
  return value === null ? '-' : String(value)
}

function percent(value: number, total: number): string {
  if (total === 0) return '-'
  return `${Math.round((value / total) * 100)}%`
}

function minNumber(values: number[]): number | null {
  return values.length > 0 ? Math.min(...values) : null
}

function maxDate(values: Array<Date | null>): Date | null {
  const timestamps = values
    .filter((value): value is Date => value !== null)
    .map(value => value.getTime())

  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps))
}

function toneTextClass(tone: PostureTone): string {
  if (tone === 'critical') return 'text-error'
  if (tone === 'warning') return 'text-warning'
  if (tone === 'healthy') return 'text-success'
  return 'text-muted-foreground'
}

function toneSurfaceClass(tone: PostureTone): string {
  if (tone === 'critical') return 'border-error-border bg-error-bg text-error'
  if (tone === 'warning') return 'border-warning-border bg-warning-bg text-warning'
  if (tone === 'healthy') return 'border-success-border bg-success-bg text-success'
  return 'border-border bg-muted text-muted-foreground'
}

function severityCount(
  rows: Array<{ apicHostId: string; severity: string; _count: { _all: number } }>,
  severity: Severity,
  hostId?: string,
): number {
  return rows
    .filter(row => row.severity === severity && (!hostId || row.apicHostId === hostId))
    .reduce((sum, row) => sum + row._count._all, 0)
}

function endpointCount(
  rows: Array<{ apicHostId: string; isActive: boolean; _count: { _all: number } }>,
  isActive: boolean,
  hostId?: string,
): number {
  return rows
    .filter(row => row.isActive === isActive && (!hostId || row.apicHostId === hostId))
    .reduce((sum, row) => sum + row._count._all, 0)
}

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const [
    hosts,
    endpointStatusRows,
    endpointVlanRows,
    endpointNodeRows,
    endpointInterfaceRows,
    endpointFreshnessRows,
    interfaces,
    latestInterfaceSamples,
    faultRows,
    healthRows,
    nodes,
    hardware,
  ] = await Promise.all([
    prisma.apicHost.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        host: true,
        lastInterfaceSyncAt: true,
        lastFaultSyncAt: true,
        lastHealthSyncAt: true,
        lastNodeSyncAt: true,
      },
    }),
    prisma.endpoint.groupBy({
      by: ['apicHostId', 'isActive'],
      _count: { _all: true },
    }),
    prisma.endpoint.findMany({
      select: { vlan: true },
      distinct: ['vlan'],
    }),
    prisma.endpoint.findMany({
      select: { node: true },
      distinct: ['node'],
    }),
    prisma.endpoint.findMany({
      select: { interface: true },
      distinct: ['interface'],
    }),
    prisma.endpoint.groupBy({
      by: ['apicHostId'],
      _max: { lastSeenAt: true },
    }),
    prisma.interfaceSnapshot.findMany({
      select: {
        id: true,
        apicHostId: true,
        adminSt: true,
        operSt: true,
      },
    }),
    prisma.interfaceSample.findMany({
      distinct: ['interfaceId'],
      orderBy: [{ interfaceId: 'asc' }, { sampledAt: 'desc' }],
      select: {
        interfaceId: true,
        sampledAt: true,
        dRxErrors: true,
        dTxErrors: true,
        dRxDiscards: true,
        dTxDiscards: true,
        dRxCrcErrors: true,
        dRxAlignErrors: true,
      },
    }),
    prisma.faultSnapshot.groupBy({
      by: ['apicHostId', 'severity'],
      where: { lifecycle: 'active' },
      _count: { _all: true },
    }),
    prisma.healthScoreSnapshot.findMany({
      where: { present: true },
      select: {
        apicHostId: true,
        scope: true,
        score: true,
      },
    }),
    prisma.nodeSnapshot.findMany({
      where: { present: true },
      select: {
        apicHostId: true,
        role: true,
        fabricSt: true,
      },
    }),
    prisma.hardwareComponent.findMany({
      where: { present: true },
      select: {
        apicHostId: true,
        type: true,
        healthy: true,
      },
    }),
  ])

  const activeEndpoints = endpointCount(endpointStatusRows, true)
  const historicalEndpoints = endpointCount(endpointStatusRows, false)
  const endpointTotal = activeEndpoints + historicalEndpoints
  const vlanCount = endpointVlanRows.filter(row => row.vlan.trim() !== '').length
  const endpointNodeCount = endpointNodeRows.filter(row => row.node.trim() !== '').length
  const endpointInterfaceCount = endpointInterfaceRows
    .filter(row => row.interface.trim() !== '').length

  const interfaceSummary = summarizeInterfaces(interfaces, latestInterfaceSamples)
  const totalInterfaces = interfaceSummary.total
  const adminDownInterfaces = interfaceSummary.adminDown
  const downInterfaces = interfaceSummary.operDown
  const noisyInterfaces = interfaceSummary.noisy

  const faultCounts = SEVERITIES.reduce<Record<Severity, number>>(
    (acc, severity) => ({ ...acc, [severity]: severityCount(faultRows, severity) }),
    { critical: 0, major: 0, minor: 0, warning: 0 },
  )
  const totalActiveFaults = SEVERITIES
    .reduce((sum, severity) => sum + faultCounts[severity], 0)

  const fabricScore = minNumber(
    healthRows
      .filter(row => row.scope === 'fabric')
      .map(row => row.score),
  )
  const nodeTenantScores = healthRows
    .filter(row => row.scope === 'node' || row.scope === 'tenant')
    .map(row => row.score)
  const worstNodeTenantScore = minNumber(nodeTenantScores)
  const worstHealthScore = worstNodeTenantScore ?? fabricScore
  const degradedHealthObjects = healthRows
    .filter(row => (row.scope === 'node' || row.scope === 'tenant') && row.score < 90)
    .length

  const nodesTotal = nodes.length
  const nodesOnline = nodes.filter(row => row.fabricSt.toLowerCase() === 'active').length
  const offlineNodes = Math.max(0, nodesTotal - nodesOnline)
  const leafCount = nodes.filter(row => row.role === 'leaf').length
  const spineCount = nodes.filter(row => row.role === 'spine').length
  const controllerCount = nodes.filter(row => row.role === 'controller').length
  const failedHardware = hardware.filter(row => !row.healthy).length
  const failedPsu = hardware.filter(row => row.type === 'psu' && !row.healthy).length
  const failedFan = hardware.filter(row => row.type === 'fan' && !row.healthy).length

  const posture = classifyPosture({
    criticalFaults: faultCounts.critical,
    majorFaults: faultCounts.major,
    failedHardware,
    worstHealthScore,
    offlineNodes,
    noisyInterfaces,
  })
  const attentionItems = buildAttentionItems({
    criticalFaults: faultCounts.critical,
    majorFaults: faultCounts.major,
    failedHardware,
    offlineNodes,
    degradedHealthObjects,
    noisyInterfaces,
    downInterfaces,
  })

  const latestEndpointSeenAt = maxDate(
    endpointFreshnessRows.map(row => row._max.lastSeenAt),
  )
  const latestInterfaceSyncAt = maxDate(hosts.map(host => host.lastInterfaceSyncAt))
  const latestFaultSyncAt = maxDate(hosts.map(host => host.lastFaultSyncAt))
  const latestHealthSyncAt = maxDate(hosts.map(host => host.lastHealthSyncAt))
  const latestNodeSyncAt = maxDate(hosts.map(host => host.lastNodeSyncAt))
  const latestAnySyncAt = maxDate([
    latestEndpointSeenAt,
    latestInterfaceSyncAt,
    latestFaultSyncAt,
    latestHealthSyncAt,
    latestNodeSyncAt,
  ])
  const now = new Date()

  const headlineStats = [
    {
      label: 'Critical faults',
      value: formatNumber(faultCounts.critical),
      detail: `${formatNumber(faultCounts.major)} major`,
      href: '/faults',
      tone: faultCounts.critical > 0 ? 'critical' : faultCounts.major > 0 ? 'warning' : 'healthy',
    },
    {
      label: 'Health score',
      value: formatScore(fabricScore),
      detail: `worst ${formatScore(worstHealthScore)}`,
      href: '/health-scores',
      tone: worstHealthScore === null ? 'unknown' : worstHealthScore < 70 ? 'critical' : worstHealthScore < 90 ? 'warning' : 'healthy',
    },
    {
      label: 'Nodes online',
      value: nodesTotal === 0 ? '-' : `${nodesOnline}/${nodesTotal}`,
      detail: percent(nodesOnline, nodesTotal),
      href: '/nodes',
      tone: offlineNodes > 0 ? 'critical' : nodesTotal === 0 ? 'unknown' : 'healthy',
    },
    {
      label: 'Failed hardware',
      value: formatNumber(failedHardware),
      detail: `${formatNumber(failedPsu)} PSU / ${formatNumber(failedFan)} fan`,
      href: '/nodes?view=components',
      tone: failedHardware > 0 ? 'critical' : hardware.length === 0 ? 'unknown' : 'healthy',
    },
    {
      label: 'Active endpoints',
      value: formatNumber(activeEndpoints),
      detail: `${formatNumber(endpointTotal)} total learned`,
      href: '/endpoints',
      tone: activeEndpoints > 0 ? 'healthy' : 'unknown',
    },
    {
      label: 'Interfaces with errors',
      value: formatNumber(noisyInterfaces),
      detail: `${formatNumber(downInterfaces)} oper down`,
      href: '/interface-health',
      tone: noisyInterfaces > 0 || downInterfaces > 0 ? 'warning' : totalInterfaces === 0 ? 'unknown' : 'healthy',
    },
  ] satisfies Array<{
    label: string
    value: string
    detail: string
    href: string
    tone: PostureTone
  }>

  const metricCards = [
    {
      title: 'Endpoints',
      href: '/endpoints',
      icon: <IconDeviceDesktopSearch size={17} stroke={1.75} />,
      value: formatNumber(activeEndpoints),
      label: 'active endpoints',
      detail: `${formatNumber(historicalEndpoints)} historical / ${formatNumber(vlanCount)} VLANs`,
      footer: `${formatNumber(endpointNodeCount)} nodes, ${formatNumber(endpointInterfaceCount)} interfaces`,
      tone: 'healthy' as PostureTone,
    },
    {
      title: 'Interfaces',
      href: '/interface-health',
      icon: <IconActivity size={17} stroke={1.75} />,
      value: formatNumber(totalInterfaces),
      label: 'tracked interfaces',
      detail: `${formatNumber(noisyInterfaces)} with recent errors`,
      footer: `${formatNumber(downInterfaces)} oper down, ${formatNumber(adminDownInterfaces)} admin down`,
      tone: noisyInterfaces > 0 || downInterfaces > 0 ? 'warning' : totalInterfaces === 0 ? 'unknown' : 'healthy',
    },
    {
      title: 'Faults',
      href: '/faults',
      icon: <IconAlertTriangle size={17} stroke={1.75} />,
      value: formatNumber(totalActiveFaults),
      label: 'active faults',
      detail: `${formatNumber(faultCounts.critical)} critical / ${formatNumber(faultCounts.major)} major`,
      footer: `${formatNumber(faultCounts.minor)} minor, ${formatNumber(faultCounts.warning)} warning`,
      tone: faultCounts.critical > 0 ? 'critical' : faultCounts.major > 0 ? 'warning' : 'healthy',
    },
    {
      title: 'Health Scores',
      href: '/health-scores',
      icon: <IconActivityHeartbeat size={17} stroke={1.75} />,
      value: formatScore(fabricScore),
      label: 'global fabric score',
      detail: `worst node/tenant ${formatScore(worstNodeTenantScore)}`,
      footer: `${formatNumber(degradedHealthObjects)} degraded objects`,
      tone: worstHealthScore === null ? 'unknown' : worstHealthScore < 70 ? 'critical' : worstHealthScore < 90 ? 'warning' : 'healthy',
    },
    {
      title: 'Nodes & Hardware',
      href: '/nodes',
      icon: <IconServer2 size={17} stroke={1.75} />,
      value: nodesTotal === 0 ? '-' : `${nodesOnline}/${nodesTotal}`,
      label: 'nodes online',
      detail: `${formatNumber(failedHardware)} failed components`,
      footer: `${formatNumber(leafCount)} leaf, ${formatNumber(spineCount)} spine, ${formatNumber(controllerCount)} controllers`,
      tone: failedHardware > 0 || offlineNodes > 0 ? 'critical' : nodesTotal === 0 ? 'unknown' : 'healthy',
    },
  ] satisfies Array<{
    title: string
    href: string
    icon: ReactNode
    value: string
    label: string
    detail: string
    footer: string
    tone: PostureTone
  }>

  const freshness = [
    { label: 'Endpoints', date: latestEndpointSeenAt },
    { label: 'Interfaces', date: latestInterfaceSyncAt },
    { label: 'Faults', date: latestFaultSyncAt },
    { label: 'Health', date: latestHealthSyncAt },
    { label: 'Nodes', date: latestNodeSyncAt },
  ]

  const hostSummaries = hosts.map((host) => {
    const hostHealth = healthRows.filter(row => row.apicHostId === host.id)
    const hostFabricScore = minNumber(
      hostHealth
        .filter(row => row.scope === 'fabric')
        .map(row => row.score),
    )
    const hostWorst = minNumber(
      hostHealth
        .filter(row => row.scope === 'node' || row.scope === 'tenant')
        .map(row => row.score),
    ) ?? hostFabricScore
    const hostNodes = nodes.filter(row => row.apicHostId === host.id)
    const hostOnlineNodes = hostNodes.filter(row => row.fabricSt.toLowerCase() === 'active').length
    const hostFailedHardware = hardware
      .filter(row => row.apicHostId === host.id && !row.healthy).length
    const hostLatestEndpoint = endpointFreshnessRows
      .find(row => row.apicHostId === host.id)?._max.lastSeenAt ?? null

    return {
      ...host,
      activeEndpoints: endpointCount(endpointStatusRows, true, host.id),
      criticalFaults: severityCount(faultRows, 'critical', host.id),
      majorFaults: severityCount(faultRows, 'major', host.id),
      healthScore: hostWorst,
      nodesOnline: hostOnlineNodes,
      nodesTotal: hostNodes.length,
      failedHardware: hostFailedHardware,
      freshest: maxDate([
        hostLatestEndpoint,
        host.lastInterfaceSyncAt,
        host.lastFaultSyncAt,
        host.lastHealthSyncAt,
        host.lastNodeSyncAt,
      ]),
    }
  })

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex min-h-16 flex-col gap-3 px-5 py-3 md:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Dashboard</h1>
            <p className="mt-0.5 text-xs text-subtle">Global ACI operations overview</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
              <IconRouter size={13} stroke={1.75} />
              {formatNumber(hosts.length)} APIC hosts
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
              <IconDatabase size={13} stroke={1.75} />
              Latest data {formatRelativeFreshness(latestAnySyncAt, now)}
            </span>
          </div>
        </div>
      </div>

      <div className="px-5 py-6 md:px-8">
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="grid lg:grid-cols-[1.1fr_1.9fr]">
            <div className="p-5 md:p-6">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${toneSurfaceClass(posture.tone)}`}>
                  <IconCircleFilled size={7} />
                  {posture.label}
                </span>
                <span className="text-xs text-muted-foreground">
                  Across all APIC hosts
                </span>
              </div>
              <div className="mt-6">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Global posture
                </p>
                <h2 className="mt-2 max-w-xl font-serif text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
                  {posture.detail}
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                  Fabric health, active faults, interface counters, endpoint inventory,
                  node state, and hardware are summarized here before operators
                  drill into the detailed pages.
                </p>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Fabric score</p>
                  <p className={`mt-1 text-2xl font-semibold ${toneTextClass(metricCards[3].tone)}`}>
                    {formatScore(fabricScore)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Worst object</p>
                  <p className={`mt-1 text-2xl font-semibold ${toneTextClass(posture.tone)}`}>
                    {formatScore(worstHealthScore)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid border-t border-border lg:grid-cols-3 lg:border-l lg:border-t-0">
              {headlineStats.map((stat, index) => (
                <Link
                  key={stat.label}
                  href={stat.href}
                  className={[
                    'group min-h-32 p-5 transition-colors hover:bg-muted/40',
                    index % 3 !== 0 ? 'lg:border-l lg:border-border' : '',
                    index > 2 ? 'border-t border-border' : index > 0 ? 'border-t border-border sm:border-t-0' : '',
                    index % 2 !== 0 ? 'sm:border-l sm:border-border lg:border-l' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                    <IconArrowUpRight
                      size={14}
                      stroke={1.75}
                      className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </div>
                  <p className={`mt-4 text-3xl font-semibold ${toneTextClass(stat.tone)}`}>
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-subtle">{stat.detail}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {metricCards.map(card => (
            <Link
              key={card.title}
              href={card.href}
              className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20 hover:bg-card/80"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${toneSurfaceClass(card.tone)}`}>
                    {card.icon}
                  </span>
                  {card.title}
                </div>
                <IconArrowUpRight
                  size={14}
                  stroke={1.75}
                  className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </div>
              <div className="mt-5">
                <p className={`text-3xl font-semibold ${toneTextClass(card.tone)}`}>
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{card.label}</p>
              </div>
              <p className="mt-4 text-sm text-foreground">{card.detail}</p>
              <p className="mt-1 text-xs text-subtle">{card.footer}</p>
            </Link>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-serif text-base font-semibold text-foreground">
                  Attention required
                </h2>
                <p className="mt-0.5 text-xs text-subtle">
                  Ordered by operational severity
                </p>
              </div>
              <IconAlertTriangle size={18} stroke={1.75} className="text-muted-foreground" />
            </div>

            {attentionItems.length > 0 ? (
              <div className="mt-4 divide-y divide-border">
                {attentionItems.map(item => (
                  <Link
                    key={item.key}
                    href={item.href}
                    className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${toneSurfaceClass(item.tone)}`}>
                      {formatNumber(item.count)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-subtle">
                        {item.detail}
                      </span>
                    </span>
                    <IconArrowUpRight
                      size={14}
                      stroke={1.75}
                      className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <div className="mt-6 flex items-center gap-3 rounded-lg border border-success-border bg-success-bg px-4 py-3 text-sm text-success">
                <IconCheck size={16} stroke={2} />
                No active attention items.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-serif text-base font-semibold text-foreground">
                  APIC host coverage
                </h2>
                <p className="mt-0.5 text-xs text-subtle">
                  Host-level inventory, health, and sync freshness
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {freshness.map(item => (
                  <span
                    key={item.label}
                    className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {item.label}: {formatRelativeFreshness(item.date, now)}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Host</th>
                    <th className="px-4 py-2 font-medium">Endpoints</th>
                    <th className="px-4 py-2 font-medium">Faults</th>
                    <th className="px-4 py-2 font-medium">Health</th>
                    <th className="px-4 py-2 font-medium">Nodes</th>
                    <th className="py-2 pl-4 font-medium">Freshest data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {hostSummaries.length > 0 ? hostSummaries.map(host => (
                    <tr key={host.id}>
                      <td className="py-3 pr-4">
                        <div className="font-medium text-foreground">{host.name}</div>
                        <div className="mt-0.5 text-xs text-subtle">{host.host}</div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        {formatNumber(host.activeEndpoints)}
                        <span className="ml-1 text-xs text-subtle">active</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={host.criticalFaults > 0 ? 'text-error' : 'text-muted-foreground'}>
                          {formatNumber(host.criticalFaults)}
                        </span>
                        <span className="mx-1 text-subtle">/</span>
                        <span className={host.majorFaults > 0 ? 'text-warning' : 'text-muted-foreground'}>
                          {formatNumber(host.majorFaults)}
                        </span>
                      </td>
                      <td className={`px-4 py-3 font-medium ${toneTextClass(host.healthScore === null ? 'unknown' : host.healthScore < 70 ? 'critical' : host.healthScore < 90 ? 'warning' : 'healthy')}`}>
                        {formatScore(host.healthScore)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={host.nodesTotal > 0 && host.nodesOnline === host.nodesTotal ? 'text-success' : host.nodesTotal === 0 ? 'text-muted-foreground' : 'text-warning'}>
                          {host.nodesTotal === 0 ? '-' : `${host.nodesOnline}/${host.nodesTotal}`}
                        </span>
                        {host.failedHardware > 0 && (
                          <span className="ml-2 text-xs text-error">
                            {formatNumber(host.failedHardware)} failed HW
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-4 text-xs text-muted-foreground">
                        {formatRelativeFreshness(host.freshest, now)}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        No APIC hosts configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-5">
          <Link href="/endpoints" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconDeviceDesktopSearch size={14} stroke={1.75} />
            Endpoint inventory
          </Link>
          <Link href="/interface-health" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconPlugConnected size={14} stroke={1.75} />
            Interface counters
          </Link>
          <Link href="/faults" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconAlertTriangle size={14} stroke={1.75} />
            Active faults
          </Link>
          <Link href="/health-scores" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconActivityHeartbeat size={14} stroke={1.75} />
            Health scores
          </Link>
          <Link href="/nodes" className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 transition-colors hover:border-foreground/20 hover:text-foreground">
            <IconServer2 size={14} stroke={1.75} />
            Nodes and hardware
          </Link>
        </div>
      </div>
    </div>
  )
}
