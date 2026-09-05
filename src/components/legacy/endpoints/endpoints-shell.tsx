import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'
import {
  LegacyEndpointReadError,
  getLegacyEndpointFilterOptions,
  getLegacyEndpointResults,
  getLegacyEndpointSummary,
  type LegacyEndpointFiltersPayload,
  type LegacyEndpointLoadState,
  type LegacyEndpointResults as LegacyEndpointResultsData,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointFilters } from './endpoint-filters'
import { LegacyEndpointResults } from './endpoint-results'
import { LegacyEndpointSummary } from './endpoint-summary'
import {
  LegacyEndpointFiltersSkeleton,
  LegacyEndpointResultsSkeleton,
  LegacyEndpointSummarySkeleton,
} from './endpoints-skeleton'

async function loadFilters(
  paramsPromise: Promise<LegacyEndpointPageParams>,
): Promise<LegacyEndpointLoadState<LegacyEndpointFiltersPayload>> {
  const params = await paramsPromise
  try {
    const options = await getLegacyEndpointFilterOptions()
    return { kind: 'ready', data: { params, options } }
  } catch (error) {
    if (!(error instanceof LegacyEndpointReadError)) throw error
    console.error('[legacy-endpoints] failed to load filter options', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  paramsPromise: Promise<LegacyEndpointPageParams>,
): Promise<LegacyEndpointLoadState<LegacyEndpointResultsData>> {
  const params = await paramsPromise
  try {
    const results = await getLegacyEndpointResults(params)
    return { kind: 'ready', data: results }
  } catch (error) {
    if (!(error instanceof LegacyEndpointReadError)) throw error
    console.error('[legacy-endpoints] failed to load results', error)
    return { kind: 'unauthorized' }
  }
}

export function LegacyEndpointsShell({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyEndpointPageParams>
}) {
  const summaryPromise = getLegacyEndpointSummary()
  const filtersPromise = loadFilters(paramsPromise)
  const resultsPromise = loadResults(paramsPromise)

  return (
    <LegacyPageShell
      title="Legacy Endpoints"
      description="Current endpoint presence and retained placement lifecycle"
    >
      <Suspense fallback={<LegacyEndpointSummarySkeleton />}>
        <LegacyEndpointSummary summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<LegacyEndpointFiltersSkeleton />}>
        <LegacyEndpointFilters dataPromise={filtersPromise} />
      </Suspense>
      <Suspense fallback={<LegacyEndpointResultsSkeleton />}>
        <LegacyEndpointResults dataPromise={resultsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
