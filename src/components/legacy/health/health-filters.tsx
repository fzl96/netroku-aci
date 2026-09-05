'use client'

import { use } from 'react'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import { LegacyListToolbar } from '@/components/legacy/legacy-list-toolbar'
import { countActiveFilterGroups, useLegacyFilters } from '@/components/legacy/use-legacy-filters'
import { buildLegacyHealthPageUrl, type LegacyHealthPageParams } from '@/lib/legacy/health/params'
import type { LegacyHealthFiltersPayload, LegacyHealthLoadState } from '@/lib/legacy/health/query'
import { LegacyHealthRegionError } from './health-region-error'

function LegacyHealthFiltersContent({
  params,
  siteOptions,
}: {
  params: LegacyHealthPageParams
  siteOptions: string[]
}) {
  const { search, isPending, apply, handleSearchChange, submitSearch } = useLegacyFilters({
    params,
    buildUrl: buildLegacyHealthPageUrl,
  })

  return (
    <LegacyListToolbar
      search={search}
      onSearchChange={handleSearchChange}
      onSearchSubmit={submitSearch}
      placeholder="Search device or site…"
      searchLabel="Search device health"
      filterLabel="Filter device health"
      activeFilterCount={countActiveFilterGroups(params.sites)}
      pending={isPending}
    >
      <FilterSubmenu
        label="Site"
        value={params.sites}
        options={siteOptions}
        onChange={(sites) => apply({ sites })}
        disabled={isPending}
      />
    </LegacyListToolbar>
  )
}

export function LegacyHealthFilters({
  dataPromise,
}: {
  dataPromise: Promise<LegacyHealthLoadState<LegacyHealthFiltersPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyHealthRegionError region="filters" />

  const { params, options } = state.data
  return <LegacyHealthFiltersContent params={params} siteOptions={options.sites} />
}
