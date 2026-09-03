import type { LegacyInterfaceListState } from '@/lib/legacy/interfaces/params'
import {
  LegacyInterfaceReadError,
  getLegacyInterfaceFilterOptions,
} from '@/lib/legacy/interfaces/query'
import { LegacyInterfaceFiltersClient } from './interfaces-client'
import { LegacyInterfaceRegionError } from './interface-region-error'

export async function LegacyInterfaceFilters({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyInterfaceListState>
}) {
  const state = await paramsPromise
  let options: Awaited<ReturnType<typeof getLegacyInterfaceFilterOptions>>
  try {
    options = await getLegacyInterfaceFilterOptions()
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load filter options', error)
    return <LegacyInterfaceRegionError region="filters" />
  }

  return <LegacyInterfaceFiltersClient state={state} devices={options.devices} />
}
