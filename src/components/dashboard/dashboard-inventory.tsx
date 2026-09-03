import type {
  DashboardEndpointData,
  DashboardHost,
  DashboardNodeData,
} from '@/lib/dashboard/query'
import { formatRelativeFreshness } from '@/lib/dashboard/summary'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { DASHBOARD_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import {
  formatDashboardNumber,
  latestDashboardDate,
} from './dashboard-presenters'
import { DashboardRegionError } from './dashboard-region-error'

type HostSummary = DashboardHost & {
  activeEndpoints: number
  nodesOnline: number
  nodesTotal: number
  failedHardware: number
  freshest: string | null
}

export async function DashboardInventory({
  hostsPromise,
  endpointsPromise,
  nodesPromise,
}: {
  hostsPromise: Promise<DashboardHost[]>
  endpointsPromise: Promise<DashboardEndpointData>
  nodesPromise: Promise<DashboardNodeData>
}) {
  let hosts: DashboardHost[]
  let endpoints: DashboardEndpointData
  let nodes: DashboardNodeData
  try {
    ;[hosts, endpoints, nodes] = await Promise.all([
      hostsPromise,
      endpointsPromise,
      nodesPromise,
    ])
  } catch {
    return <DashboardRegionError region="host coverage" />
  }

  const endpointHosts = new Map(endpoints.byHost.map(host => [host.hostId, host]))
    const nodeHosts = new Map(nodes.byHost.map(host => [host.hostId, host]))
    const hostSummaries: HostSummary[] = hosts.map(host => {
      const endpoint = endpointHosts.get(host.id)
      const node = nodeHosts.get(host.id)
      return {
        ...host,
        activeEndpoints: endpoint?.active ?? 0,
        nodesOnline: node?.nodesOnline ?? 0,
        nodesTotal: node?.nodesTotal ?? 0,
        failedHardware: node?.failedHardware ?? 0,
        freshest: latestDashboardDate([
          endpoint?.latestSeenAt ?? null,
          host.lastInterfaceSyncAt,
          host.lastNodeSyncAt,
        ]),
      }
    })
    const freshness = [
      {
        label: 'Endpoints',
        date: latestDashboardDate(endpoints.byHost.map(host => host.latestSeenAt)),
      },
      {
        label: 'Interfaces',
        date: latestDashboardDate(hosts.map(host => host.lastInterfaceSyncAt)),
      },
      {
        label: 'Nodes',
        date: latestDashboardDate(hosts.map(host => host.lastNodeSyncAt)),
      },
    ]

  return (
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-serif text-base font-semibold text-foreground">APIC host coverage</h2>
            <p className="mt-0.5 text-xs text-subtle">Host-level inventory and sync freshness</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {freshness.map(item => (
              <span key={item.label} className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground">
                {item.label}: {formatRelativeFreshness(item.date)}
              </span>
            ))}
          </div>
        </div>

        <div className={`mt-4 hidden md:block ${TABLE_SCROLL_CLS}`}>
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className={`${DASHBOARD_TABLE_HEAD_CLS} py-2 pr-4`}>Host</th>
                <th className={`${DASHBOARD_TABLE_HEAD_CLS} px-4 py-2`}>Endpoints</th>
                <th className={`${DASHBOARD_TABLE_HEAD_CLS} px-4 py-2`}>Nodes</th>
                <th className={`${DASHBOARD_TABLE_HEAD_CLS} py-2 pl-4`}>Freshest data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {hostSummaries.length > 0 ? hostSummaries.map(host => (
                <tr key={host.id}>
                  <td className="py-3 pr-4"><div className="font-medium text-foreground">{host.name}</div><div className="mt-0.5 text-xs text-subtle">{host.host}</div></td>
                  <td className="px-4 py-3 text-foreground">{formatDashboardNumber(host.activeEndpoints)} <span className="text-xs text-subtle">active</span></td>
                  <td className="px-4 py-3">
                    <span className={host.nodesTotal > 0 && host.nodesOnline === host.nodesTotal ? 'text-success' : host.nodesTotal === 0 ? 'text-muted-foreground' : 'text-warning'}>
                      {host.nodesTotal === 0 ? '-' : `${host.nodesOnline}/${host.nodesTotal}`}
                    </span>
                    {host.failedHardware > 0 ? <span className="ml-2 text-xs text-error">{formatDashboardNumber(host.failedHardware)} failed HW</span> : null}
                  </td>
                  <td className="py-3 pl-4 text-xs text-muted-foreground">{formatRelativeFreshness(host.freshest)}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No APIC hosts configured yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-2 md:hidden">
          {hostSummaries.length > 0 ? hostSummaries.map(host => (
            <DataCard key={host.id}>
              <DataCardHeader><DataCardTitle>{host.name}</DataCardTitle><p className="mt-0.5 truncate text-xs text-subtle">{host.host}</p></DataCardHeader>
              <DataCardBody>
                <DataCardRow label="Endpoints" value={`${formatDashboardNumber(host.activeEndpoints)} active`} />
                <DataCardRow label="Nodes" value={host.nodesTotal === 0 ? '—' : `${host.nodesOnline}/${host.nodesTotal} online`} />
                <DataCardRow label="Freshest data" value={formatRelativeFreshness(host.freshest)} />
              </DataCardBody>
            </DataCard>
          )) : <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">No APIC hosts configured yet.</div>}
        </div>
      </section>
  )
}
