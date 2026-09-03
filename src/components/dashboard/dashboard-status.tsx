import { IconDatabase, IconRouter } from '@tabler/icons-react'
import type {
  DashboardEndpointData,
  DashboardHost,
} from '@/lib/dashboard/query'
import { formatRelativeFreshness } from '@/lib/dashboard/summary'
import {
  formatDashboardNumber,
  latestDashboardDate,
} from './dashboard-presenters'
import { DashboardRegionError } from './dashboard-region-error'

export async function DashboardStatus({
  hostsPromise,
  endpointsPromise,
}: {
  hostsPromise: Promise<DashboardHost[]>
  endpointsPromise: Promise<DashboardEndpointData>
}) {
  let hosts: DashboardHost[]
  let endpoints: DashboardEndpointData
  try {
    ;[hosts, endpoints] = await Promise.all([hostsPromise, endpointsPromise])
  } catch {
    return <DashboardRegionError region="status" compact />
  }

  const latest = latestDashboardDate([
    ...hosts.flatMap(host => [host.lastInterfaceSyncAt, host.lastNodeSyncAt]),
    ...endpoints.byHost.map(host => host.latestSeenAt),
  ])

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
        <IconRouter size={13} stroke={1.75} />
        {formatDashboardNumber(hosts.length)} APIC hosts
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1">
        <IconDatabase size={13} stroke={1.75} />
        Latest data {formatRelativeFreshness(latest)}
      </span>
    </div>
  )
}
