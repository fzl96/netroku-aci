import Link from 'next/link'
import { IconActivity, IconArrowUpRight, IconDeviceDesktopSearch } from '@tabler/icons-react'
import type {
  DashboardEndpointData,
  DashboardInterfaceData,
  DashboardNodeData,
} from '@/lib/dashboard/query'
import type { PostureTone } from '@/lib/dashboard/summary'
import {
  dashboardToneSurfaceClass,
  dashboardToneTextClass,
  formatDashboardNumber,
} from './dashboard-presenters'
import { DashboardRegionError } from './dashboard-region-error'
import { NodesTile } from './nodes-tile'

type MetricCardProps = {
  title: string
  href: string
  icon: React.ReactNode
  value: string
  label: string
  detail: string
  footer: string
  tone: PostureTone
}

function MetricCard(props: MetricCardProps) {
  return (
    <Link href={props.href} className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20 hover:bg-card/80">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className={`inline-flex size-8 items-center justify-center rounded-lg border ${dashboardToneSurfaceClass(props.tone)}`}>
            {props.icon}
          </span>
          {props.title}
        </div>
        <IconArrowUpRight size={14} stroke={1.75} className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-5">
        <p className={`text-3xl font-semibold ${dashboardToneTextClass(props.tone)}`}>{props.value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{props.label}</p>
      </div>
      <p className="mt-4 text-sm text-foreground">{props.detail}</p>
      <p className="mt-1 text-xs text-subtle">{props.footer}</p>
    </Link>
  )
}

export async function DashboardMetrics({
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
    return <DashboardRegionError region="metrics" />
  }

  return (
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-label="Operational metrics">
        <MetricCard
          title="Endpoints"
          href="/endpoints"
          icon={<IconDeviceDesktopSearch size={17} stroke={1.75} />}
          value={formatDashboardNumber(endpoints.active)}
          label="active endpoints"
          detail={`${formatDashboardNumber(endpoints.historical)} historical / ${formatDashboardNumber(endpoints.vlanCount)} VLANs`}
          footer={`${formatDashboardNumber(endpoints.nodeCount)} nodes, ${formatDashboardNumber(endpoints.interfaceCount)} interfaces`}
          tone={endpoints.active > 0 ? 'healthy' : 'unknown'}
        />
        <MetricCard
          title="Interfaces"
          href="/interface-health"
          icon={<IconActivity size={17} stroke={1.75} />}
          value={formatDashboardNumber(interfaces.total)}
          label="tracked interfaces"
          detail={`${formatDashboardNumber(interfaces.noisy)} with recent errors`}
          footer={`${formatDashboardNumber(interfaces.operDown)} oper down, ${formatDashboardNumber(interfaces.adminDown)} admin down`}
          tone={interfaces.noisy > 0 || interfaces.operDown > 0
            ? 'warning'
            : interfaces.total === 0 ? 'unknown' : 'healthy'}
        />
        <NodesTile nodes={nodes} />
      </section>
  )
}
