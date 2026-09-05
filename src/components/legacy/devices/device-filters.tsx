'use client'

import { use } from 'react'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import { LegacyListToolbar } from '@/components/legacy/legacy-list-toolbar'
import { countActiveFilterGroups, useLegacyFilters } from '@/components/legacy/use-legacy-filters'
import { buildLegacyDevicePageUrl, type LegacyDevicePageParams } from '@/lib/legacy/devices/params'
import type { LegacyDeviceFiltersPayload, LegacyDeviceLoadState } from '@/lib/legacy/devices/query'
import { LegacyDeviceRegionError } from './device-region-error'

function LegacyDeviceFiltersContent({
  params,
  siteOptions,
  typeOptions,
}: {
  params: LegacyDevicePageParams
  siteOptions: string[]
  typeOptions: string[]
}) {
  const { search, isPending, apply, handleSearchChange, submitSearch } = useLegacyFilters({
    params,
    buildUrl: buildLegacyDevicePageUrl,
  })

  return (
    <LegacyListToolbar
      search={search}
      onSearchChange={handleSearchChange}
      onSearchSubmit={submitSearch}
      placeholder="Search hostname, IP, model…"
      searchLabel="Search devices"
      filterLabel="Filter devices"
      activeFilterCount={countActiveFilterGroups(params.sites, params.deviceTypes)}
      pending={isPending}
    >
      <FilterSubmenu
        label="Site"
        value={params.sites}
        options={siteOptions}
        onChange={(sites) => apply({ sites })}
        disabled={isPending}
      />
      <FilterSubmenu
        label="Device type"
        value={params.deviceTypes}
        options={typeOptions}
        onChange={(deviceTypes) => apply({ deviceTypes })}
        disabled={isPending}
      />
    </LegacyListToolbar>
  )
}

export function LegacyDeviceFilters({
  dataPromise,
}: {
  dataPromise: Promise<LegacyDeviceLoadState<LegacyDeviceFiltersPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyDeviceRegionError region="filters" />

  const { params, options } = state.data
  return (
    <LegacyDeviceFiltersContent
      params={params}
      siteOptions={options.siteOptions}
      typeOptions={options.typeOptions}
    />
  )
}
