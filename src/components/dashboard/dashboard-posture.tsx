import Link from 'next/link'
import { IconArrowUpRight, IconCircleFilled } from '@tabler/icons-react'
import type {
  DashboardEndpointData,
  DashboardInterfaceData,
  DashboardNodeData,
} from '@/lib/dashboard/query'
import { classifyPosture, type PostureTone } from '@/lib/dashboard/summary'
import {
  dashboardToneSurfaceClass,
  dashboardToneTextClass,
  formatDashboardNumber,
  formatDashboardPercent,
} from './dashboard-presenters'
import { DashboardRegionError } from './dashboard-region-error'

type HeadlineStat = {
  label: string
  value: string
  detail: string
  href: string
  tone: PostureTone
}

export async function DashboardPosture({
  endpointsPromise,
  interfacesPromise,
  nodesPromise,
}: {
  endpointsPromise: Promise<DashboardEndpointData>
  interfacesPromise: Promise<DashboardInterfaceData>
  nodesPromise: Promise<DashboardNodeData>
}) {
  let endpoints: DashboardEndpointData
  let interfaces: DashboardInterfaceData
  let nodes: DashboardNodeData
  try {
    ;[endpoints, interfaces, nodes] = await Promise.all([
      endpointsPromise,
      interfacesPromise,
      nodesPromise,
    ])
  } catch {
    return <DashboardRegionError region="posture" />
  }

  const offlineNodes = Math.max(0, nodes.nodesTotal - nodes.nodesOnline)
  const posture = classifyPosture({
      failedHardware: nodes.failedHardware,
      offlineNodes,
      noisyInterfaces: interfaces.noisy,
    })
    const endpointTotal = endpoints.active + endpoints.historical
    const headlineStats: HeadlineStat[] = [
      {
        label: 'Nodes online',
        value: nodes.nodesTotal === 0 ? '-' : `${nodes.nodesOnline}/${nodes.nodesTotal}`,
        detail: formatDashboardPercent(nodes.nodesOnline, nodes.nodesTotal),
        href: '/nodes',
        tone: offlineNodes > 0 ? 'critical' : nodes.nodesTotal === 0 ? 'unknown' : 'healthy',
      },
      {
        label: 'Failed hardware',
        value: formatDashboardNumber(nodes.failedHardware),
        detail: `${formatDashboardNumber(nodes.failedPsu)} PSU / ${formatDashboardNumber(nodes.failedFan)} fan`,
        href: '/nodes?view=components',
        tone: nodes.failedHardware > 0 ? 'critical' : nodes.hardwareTotal === 0 ? 'unknown' : 'healthy',
      },
      {
        label: 'Active endpoints',
        value: formatDashboardNumber(endpoints.active),
        detail: `${formatDashboardNumber(endpointTotal)} total learned`,
        href: '/endpoints',
        tone: endpoints.active > 0 ? 'healthy' : 'unknown',
      },
      {
        label: 'Interfaces with errors',
        value: formatDashboardNumber(interfaces.noisy),
        detail: `${formatDashboardNumber(interfaces.operDown)} oper down`,
        href: '/interface-health',
        tone: interfaces.noisy > 0 || interfaces.operDown > 0
          ? 'warning'
          : interfaces.total === 0 ? 'unknown' : 'healthy',
      },
    ]

  return (
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid lg:grid-cols-[1.1fr_1.9fr]">
          <div className="p-5 md:p-6">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ${dashboardToneSurfaceClass(posture.tone)}`}>
                <IconCircleFilled size={7} />
                {posture.label}
              </span>
              <span className="text-xs text-muted-foreground">Across all APIC hosts</span>
            </div>
            <div className="mt-6">
              <p className="text-xs font-medium uppercase text-muted-foreground">Global posture</p>
              <h2 className="mt-2 max-w-xl font-serif text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
                {posture.detail}
              </h2>
              <p className="mt-4 max-w-lg text-sm leading-6 text-muted-foreground">
                Interface counters, endpoint inventory, node state, and hardware are summarized here before operators drill into the detailed pages.
              </p>
            </div>
          </div>

          <div className="grid border-t border-border sm:grid-cols-2 lg:border-l lg:border-t-0">
            {headlineStats.map((stat, index) => (
              <Link
                key={stat.label}
                href={stat.href}
                className={[
                  'group min-h-32 p-5 transition-colors hover:bg-muted/40',
                  index % 2 !== 0 ? 'sm:border-l sm:border-border' : '',
                  index > 1 ? 'border-t border-border' : index > 0 ? 'border-t border-border sm:border-t-0' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                  <IconArrowUpRight size={14} stroke={1.75} className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
                </div>
                <p className={`mt-4 text-3xl font-semibold ${dashboardToneTextClass(stat.tone)}`}>{stat.value}</p>
                <p className="mt-1 text-xs text-subtle">{stat.detail}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
  )
}
