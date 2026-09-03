import Link from 'next/link'
import { IconAlertTriangle, IconArrowUpRight, IconCheck } from '@tabler/icons-react'
import type { DashboardInterfaceData, DashboardNodeData } from '@/lib/dashboard/query'
import { buildAttentionItems } from '@/lib/dashboard/summary'
import {
  dashboardToneSurfaceClass,
  formatDashboardNumber,
} from './dashboard-presenters'
import { DashboardRegionError } from './dashboard-region-error'

export async function DashboardAttention({
  interfacesPromise,
  nodesPromise,
}: {
  interfacesPromise: Promise<DashboardInterfaceData>
  nodesPromise: Promise<DashboardNodeData>
}) {
  let interfaces: DashboardInterfaceData
  let nodes: DashboardNodeData
  try {
    ;[interfaces, nodes] = await Promise.all([interfacesPromise, nodesPromise])
  } catch {
    return <DashboardRegionError region="attention items" />
  }

  const attentionItems = buildAttentionItems({
      failedHardware: nodes.failedHardware,
      offlineNodes: Math.max(0, nodes.nodesTotal - nodes.nodesOnline),
      noisyInterfaces: interfaces.noisy,
      downInterfaces: interfaces.operDown,
    })

  return (
      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-base font-semibold text-foreground">Attention required</h2>
            <p className="mt-0.5 text-xs text-subtle">Ordered by operational severity</p>
          </div>
          <IconAlertTriangle size={18} stroke={1.75} className="text-muted-foreground" />
        </div>

        {attentionItems.length > 0 ? (
          <div className="mt-4 divide-y divide-border">
            {attentionItems.map(item => (
              <Link key={item.key} href={item.href} className="group flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${dashboardToneSurfaceClass(item.tone)}`}>
                  {formatDashboardNumber(item.count)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="mt-0.5 block truncate text-xs text-subtle">{item.detail}</span>
                </span>
                <IconArrowUpRight size={14} stroke={1.75} className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
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
  )
}
