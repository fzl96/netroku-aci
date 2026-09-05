import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyInterfaceListState } from '@/lib/legacy/interfaces/params'
import {
  LegacyInterfaceReadError,
  getLegacyInterfaceFilterOptions,
  getLegacyInterfaceResults,
  getLegacyInterfaceSummary,
  type LegacyInterfaceFiltersPayload,
  type LegacyInterfaceLoadState,
  type LegacyInterfaceResultsPayload,
} from '@/lib/legacy/interfaces/query'
import { LegacyInterfaceFilters } from './interface-filters'
import { LegacyInterfaceResults } from './interface-results'
import { LegacyInterfaceSummary } from './interface-summary'
import {
  LegacyInterfaceFiltersSkeleton,
  LegacyInterfaceResultsSkeleton,
  LegacyInterfaceSummarySkeleton,
} from './interfaces-skeleton'

async function loadFilters(
  paramsPromise: Promise<LegacyInterfaceListState>,
): Promise<LegacyInterfaceLoadState<LegacyInterfaceFiltersPayload>> {
  const state = await paramsPromise
  try {
    const options = await getLegacyInterfaceFilterOptions()
    return { kind: 'ready', data: { state, devices: options.devices } }
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load filter options', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  paramsPromise: Promise<LegacyInterfaceListState>,
): Promise<LegacyInterfaceLoadState<LegacyInterfaceResultsPayload>> {
  const state = await paramsPromise
  try {
    const results = await getLegacyInterfaceResults(state)
    return { kind: 'ready', data: { state, results } }
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load results', error)
    return { kind: 'unauthorized' }
  }
}

export function LegacyInterfacesShell({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyInterfaceListState>
}) {
  const summaryPromise = getLegacyInterfaceSummary()
  const filtersPromise = loadFilters(paramsPromise)
  const resultsPromise = loadResults(paramsPromise)

  return (
    <LegacyPageShell
      title="Legacy Interfaces"
      description="Current interface inventory, exact counters, and historical trends"
    >
      <Suspense fallback={<LegacyInterfaceSummarySkeleton />}>
        <LegacyInterfaceSummary summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<LegacyInterfaceFiltersSkeleton />}>
        <LegacyInterfaceFilters dataPromise={filtersPromise} />
      </Suspense>
      <Suspense fallback={<LegacyInterfaceResultsSkeleton />}>
        <LegacyInterfaceResults dataPromise={resultsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
