'use client'

import { use, useMemo } from 'react'
import { FilterSubmenu, type FilterOption } from '@/components/FilterSubmenu'
import { LegacyListToolbar } from '@/components/legacy/legacy-list-toolbar'
import { countActiveFilterGroups, useLegacyFilters } from '@/components/legacy/use-legacy-filters'
import type { LegacyEndpointStatus } from '@/lib/legacy/endpoints/filters'
import {
  buildLegacyEndpointPageUrl,
  LEGACY_ENDPOINT_STATUSES,
  type LegacyEndpointPageParams,
} from '@/lib/legacy/endpoints/params'
import type {
  LegacyEndpointFilterOptions,
  LegacyEndpointFiltersPayload,
  LegacyEndpointLoadState,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointRegionError } from './endpoint-region-error'

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'active', label: 'Active' },
  { value: 'historical', label: 'Historical' },
]

function LegacyEndpointFiltersContent({
  params,
  options,
}: {
  params: LegacyEndpointPageParams
  options: LegacyEndpointFilterOptions
}) {
  const { search, isPending, apply, handleSearchChange, submitSearch } = useLegacyFilters({
    params,
    buildUrl: buildLegacyEndpointPageUrl,
  })

  const deviceOptions = useMemo<FilterOption[]>(
    () =>
      options.devices.map((device) => ({
        value: device.id,
        label: device.site ? `${device.hostname} · ${device.site}` : device.hostname,
      })),
    [options.devices],
  )

  // Active-only is the resting state, so it is not a narrowing the reader chose.
  const statusIsFiltered = !(params.statuses.length === 1 && params.statuses[0] === 'active')

  return (
    <LegacyListToolbar
      search={search}
      onSearchChange={handleSearchChange}
      onSearchSubmit={submitSearch}
      placeholder="Search MAC, IP, VLAN, or device…"
      searchLabel="Search endpoints"
      filterLabel="Filter endpoints"
      activeFilterCount={
        countActiveFilterGroups(params.sites, params.devices, params.vlans, params.interfaces) +
        (statusIsFiltered ? 1 : 0)
      }
      pending={isPending}
    >
      <FilterSubmenu
        label="Site"
        value={params.sites}
        options={options.sites}
        onChange={(sites) => apply({ sites })}
        disabled={isPending}
      />
      <FilterSubmenu
        label="Device"
        value={params.devices}
        options={deviceOptions}
        onChange={(devices) => apply({ devices })}
        disabled={isPending}
        searchable
      />
      <FilterSubmenu
        label="VLAN"
        value={params.vlans}
        options={options.vlans}
        onChange={(vlans) => apply({ vlans })}
        disabled={isPending}
        searchable
      />
      <FilterSubmenu
        label="Interface"
        value={params.interfaces}
        options={options.interfaces}
        onChange={(interfaces) => apply({ interfaces })}
        disabled={isPending}
        searchable
      />
      <FilterSubmenu
        label="Lifecycle"
        value={params.statuses}
        options={STATUS_OPTIONS}
        onChange={(statuses) =>
          apply({
            statuses: LEGACY_ENDPOINT_STATUSES.filter((status) =>
              statuses.includes(status),
            ) as LegacyEndpointStatus[],
          })
        }
        disabled={isPending}
      />
    </LegacyListToolbar>
  )
}

export function LegacyEndpointFilters({
  dataPromise,
}: {
  dataPromise: Promise<LegacyEndpointLoadState<LegacyEndpointFiltersPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyEndpointRegionError region="filters" />

  const { params, options } = state.data
  return <LegacyEndpointFiltersContent params={params} options={options} />
}
