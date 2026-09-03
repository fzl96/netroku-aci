import type { LegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'
import {
  LegacyEndpointReadError,
  getLegacyEndpointFilterOptions,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointFiltersClient } from './endpoints-client'
import { LegacyEndpointRegionError } from './endpoint-region-error'

export async function LegacyEndpointFilters({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyEndpointPageParams>
}) {
  const params = await paramsPromise
  let options: Awaited<ReturnType<typeof getLegacyEndpointFilterOptions>>
  try {
    options = await getLegacyEndpointFilterOptions()
  } catch (error) {
    if (!(error instanceof LegacyEndpointReadError)) throw error
    console.error('[legacy-endpoints] failed to load filter options', error)
    return <LegacyEndpointRegionError region="filters" />
  }

  return <LegacyEndpointFiltersClient params={params} options={options} />
}
