'use client'

import { use } from 'react'
import dynamic from 'next/dynamic'
import type { InterfaceLoadState, InterfaceCrcTrendPayload } from '@/lib/interface-health/query'
import { InterfaceRegionError } from './interface-region-error'

// recharts is heavy and only needed once the CRC view is selected, so it is
// code-split out of the initial interface-health bundle.
const InterfaceCrcTrendChart = dynamic(
  () => import('./interface-crc-trend-chart').then((m) => m.InterfaceCrcTrendChart),
  { ssr: false },
)

export function InterfaceCrcTrend({
  dataPromise,
}: {
  dataPromise: Promise<InterfaceLoadState<InterfaceCrcTrendPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <InterfaceRegionError region="trend" />
  if (state.kind === 'inactive') return null

  return <InterfaceCrcTrendChart trend={state.data.trend} />
}
