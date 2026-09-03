import Link from 'next/link'
import { IconArrowUpRight, IconServer2 } from '@tabler/icons-react'
import type { DashboardNodeData } from '@/lib/dashboard/query'
import type { PostureTone } from '@/lib/dashboard/summary'
import {
  dashboardToneSurfaceClass,
  dashboardToneTextClass,
  formatDashboardNumber,
} from './dashboard-presenters'

export function NodesTile({ nodes }: { nodes: DashboardNodeData }) {
  const offlineNodes = Math.max(0, nodes.nodesTotal - nodes.nodesOnline)
  const tone: PostureTone = nodes.failedHardware > 0 || offlineNodes > 0
    ? 'critical'
    : nodes.nodesTotal === 0 ? 'unknown' : 'healthy'

  return (
    <Link href="/nodes" className="group rounded-lg border border-border bg-card p-5 shadow-sm transition-colors hover:border-foreground/20 hover:bg-card/80">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className={`inline-flex size-8 items-center justify-center rounded-lg border ${dashboardToneSurfaceClass(tone)}`}>
            <IconServer2 size={17} stroke={1.75} />
          </span>
          Nodes &amp; Hardware
        </div>
        <IconArrowUpRight size={14} stroke={1.75} className="text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
      <div className="mt-5">
        <p className={`text-3xl font-semibold ${dashboardToneTextClass(tone)}`}>
          {nodes.nodesTotal === 0 ? '-' : `${nodes.nodesOnline}/${nodes.nodesTotal}`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">nodes online</p>
      </div>
      <p className="mt-4 text-sm text-foreground">
        {formatDashboardNumber(nodes.failedHardware)} failed components
      </p>
      <p className="mt-1 text-xs text-subtle">
        {formatDashboardNumber(nodes.leafCount)} leaf, {formatDashboardNumber(nodes.spineCount)} spine, {formatDashboardNumber(nodes.controllerCount)} controllers
      </p>
    </Link>
  )
}
