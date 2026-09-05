import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyHealthPageParams } from '@/lib/legacy/health/params'
import {
  LegacyHealthReadError,
  getLegacyHealthFilterOptions,
  getLegacyHealthResults,
  getLegacyHealthSummary,
  type LegacyHealthFiltersPayload,
  type LegacyHealthLoadState,
  type LegacyHealthResults as LegacyHealthResultsData,
} from '@/lib/legacy/health/query'
import { LegacyHealthFilters } from './health-filters'
import { LegacyHealthResults } from './health-results'
import { LegacyHealthSummary } from './health-summary'
import {
  LegacyHealthFiltersSkeleton,
  LegacyHealthResultsSkeleton,
  LegacyHealthSummarySkeleton,
} from './health-skeleton'

async function loadFilters(
  paramsPromise: Promise<LegacyHealthPageParams>,
): Promise<LegacyHealthLoadState<LegacyHealthFiltersPayload>> {
  const params = await paramsPromise
  try {
    const options = await getLegacyHealthFilterOptions()
    return { kind: 'ready', data: { params, options } }
  } catch (error) {
    if (!(error instanceof LegacyHealthReadError)) throw error
    console.error('[legacy-health] failed to load filter options', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  paramsPromise: Promise<LegacyHealthPageParams>,
): Promise<LegacyHealthLoadState<LegacyHealthResultsData>> {
  const params = await paramsPromise
  try {
    const results = await getLegacyHealthResults(params)
    return { kind: 'ready', data: results }
  } catch (error) {
    if (!(error instanceof LegacyHealthReadError)) throw error
    console.error('[legacy-health] failed to load results', error)
    return { kind: 'unauthorized' }
  }
}

export function LegacyHealthShell({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyHealthPageParams>
}) {
  const summaryPromise = getLegacyHealthSummary()
  const filtersPromise = loadFilters(paramsPromise)
  const resultsPromise = loadResults(paramsPromise)

  return (
    <LegacyPageShell
      title="Legacy Health"
      description="Latest device health, historical measurements, and collected logs"
    >
      <Suspense fallback={<LegacyHealthSummarySkeleton />}>
        <LegacyHealthSummary summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<LegacyHealthFiltersSkeleton />}>
        <LegacyHealthFilters dataPromise={filtersPromise} />
      </Suspense>
      <Suspense fallback={<LegacyHealthResultsSkeleton />}>
        <LegacyHealthResults dataPromise={resultsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
