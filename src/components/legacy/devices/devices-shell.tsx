import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyDevicePageParams } from '@/lib/legacy/devices/params'
import {
  LegacyDeviceReadError,
  getLegacyDeviceFilterOptions,
  getLegacyDeviceResults,
  getLegacyDeviceSummary,
  type LegacyDeviceFiltersPayload,
  type LegacyDeviceLoadState,
  type LegacyDeviceResults as LegacyDeviceResultsData,
} from '@/lib/legacy/devices/query'
import { LegacyDeviceFilters } from './device-filters'
import { LegacyDeviceResults } from './device-results'
import { LegacyDeviceSummary } from './device-summary'
import {
  LegacyDeviceFiltersSkeleton,
  LegacyDeviceResultsSkeleton,
  LegacyDeviceSummarySkeleton,
} from './devices-skeleton'

async function loadFilters(
  paramsPromise: Promise<LegacyDevicePageParams>,
): Promise<LegacyDeviceLoadState<LegacyDeviceFiltersPayload>> {
  const params = await paramsPromise
  try {
    const options = await getLegacyDeviceFilterOptions()
    return { kind: 'ready', data: { params, options } }
  } catch (error) {
    if (!(error instanceof LegacyDeviceReadError)) throw error
    console.error('[legacy-devices] failed to load filter options', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  paramsPromise: Promise<LegacyDevicePageParams>,
): Promise<LegacyDeviceLoadState<LegacyDeviceResultsData>> {
  const params = await paramsPromise
  try {
    const results = await getLegacyDeviceResults(params)
    return { kind: 'ready', data: results }
  } catch (error) {
    if (!(error instanceof LegacyDeviceReadError)) throw error
    console.error('[legacy-devices] failed to load results', error)
    return { kind: 'unauthorized' }
  }
}

export function LegacyDevicesShell({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyDevicePageParams>
}) {
  const summaryPromise = getLegacyDeviceSummary()
  const filtersPromise = loadFilters(paramsPromise)
  const resultsPromise = loadResults(paramsPromise)

  return (
    <LegacyPageShell
      title="Legacy Devices"
      description="Inventory and collection freshness from legacy network devices"
    >
      <Suspense fallback={<LegacyDeviceSummarySkeleton />}>
        <LegacyDeviceSummary summaryPromise={summaryPromise} />
      </Suspense>
      <Suspense fallback={<LegacyDeviceFiltersSkeleton />}>
        <LegacyDeviceFilters dataPromise={filtersPromise} />
      </Suspense>
      <Suspense fallback={<LegacyDeviceResultsSkeleton />}>
        <LegacyDeviceResults dataPromise={resultsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
