'use client'

import { use } from 'react'
import type { NodeLoadState, NodeOverviewPayload } from '@/lib/nodes/query'
import { NodeRegionError } from './node-region-error'

export function NodeOverview({
  dataPromise,
}: {
  dataPromise: Promise<NodeLoadState<NodeOverviewPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <NodeRegionError region="overview" />
  if (state.kind === 'inactive') return null

  const { overview } = state.data
  const onlineClass =
    overview.nodesTotal === 0
      ? 'text-muted-foreground'
      : overview.nodesOnline === overview.nodesTotal
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-amber-600 dark:text-amber-500'

  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[9px] font-semibold tracking-[0.12em] text-faint uppercase">
            Nodes online
          </p>
          <span className={`font-serif text-4xl font-semibold tabular-nums ${onlineClass}`}>
            {overview.nodesTotal === 0 ? '–' : `${overview.nodesOnline}/${overview.nodesTotal}`}
          </span>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[9px] font-semibold tracking-[0.12em] text-faint uppercase">
            Failed components
          </p>
          <span
            className={`text-2xl font-semibold tabular-nums ${overview.componentsFailed > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
          >
            {overview.componentsFailed}
          </span>
        </div>
      </div>
    </section>
  )
}
