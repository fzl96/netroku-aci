'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'
import type { NodeLoadState, NodeTrendPayload } from '@/lib/nodes/query'
import { NodeRegionError } from './node-region-error'

const NodesTrendChart = dynamic(() => import('./nodes-trend-chart'), {
  ssr: false,
  loading: () => (
    <div className="h-[232px] animate-pulse rounded-2xl border border-border bg-card p-4 shadow-sm" />
  ),
})

export function NodeTrend({
  dataPromise,
}: {
  dataPromise: Promise<NodeLoadState<NodeTrendPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <NodeRegionError region="trend" />
  if (state.kind === 'inactive') return null

  const { trend } = state.data
  return trend.length ? <NodesTrendChart trend={trend} /> : null
}
