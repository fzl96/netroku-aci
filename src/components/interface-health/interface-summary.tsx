'use client'

import { use } from 'react'
import type { InterfaceLoadState, InterfaceResultsPayload } from '@/lib/interface-health/query'

export function InterfaceSummary({
  dataPromise,
}: {
  dataPromise: Promise<InterfaceLoadState<InterfaceResultsPayload>>
}) {
  const state = use(dataPromise)
  // Silent by design: the summary is decoration next to the filter bar, so a
  // failure here should not add another error tile beside the results table.
  if (state.kind !== 'ready') return null

  const { params, results } = state.data
  const scope =
    params.view === 'crc'
      ? ` (CRC increase in last ${params.window})`
      : params.view === 'state-changed'
        ? ` (state changed in last ${params.window})`
        : ''

  return (
    <span>
      <span className="font-semibold text-foreground">{results.total}</span>{' '}
      {results.total === 1 ? 'interface' : 'interfaces'}
      {scope}
    </span>
  )
}
