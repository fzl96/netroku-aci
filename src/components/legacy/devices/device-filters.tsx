import type { LegacyDevicePageParams } from '@/lib/legacy/devices/params'
import { LegacyDeviceReadError, getLegacyDeviceFilterOptions } from '@/lib/legacy/devices/query'
import { LegacyDeviceFiltersClient } from './devices-client'
import { LegacyDeviceRegionError } from './device-region-error'

export async function LegacyDeviceFilters({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyDevicePageParams>
}) {
  const params = await paramsPromise
  let options: Awaited<ReturnType<typeof getLegacyDeviceFilterOptions>>
  try {
    options = await getLegacyDeviceFilterOptions()
  } catch (error) {
    if (!(error instanceof LegacyDeviceReadError)) throw error
    console.error('[legacy-devices] failed to load filter options', error)
    return <LegacyDeviceRegionError region="filters" />
  }

  return (
    <LegacyDeviceFiltersClient
      params={params}
      siteOptions={options.siteOptions}
      typeOptions={options.typeOptions}
    />
  )
}
