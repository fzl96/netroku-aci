import type { LegacyHealthPageParams } from '@/lib/legacy/health/params'
import { LegacyHealthReadError, getLegacyHealthFilterOptions } from '@/lib/legacy/health/query'
import { LegacyHealthFiltersClient } from './health-client'
import { LegacyHealthRegionError } from './health-region-error'

export async function LegacyHealthFilters({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyHealthPageParams>
}) {
  const params = await paramsPromise
  let options: Awaited<ReturnType<typeof getLegacyHealthFilterOptions>>
  try {
    options = await getLegacyHealthFilterOptions()
  } catch (error) {
    if (!(error instanceof LegacyHealthReadError)) throw error
    console.error('[legacy-health] failed to load filter options', error)
    return <LegacyHealthRegionError region="filters" />
  }

  return <LegacyHealthFiltersClient params={params} siteOptions={options.sites} />
}
