'use client'

import { type FormEvent, use, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyDevicePageUrl,
  LEGACY_DEVICE_SORTS,
  type LegacyDevicePageParams,
  type LegacyDeviceSort,
} from '@/lib/legacy/devices/params'
import type { LegacyDeviceFiltersPayload, LegacyDeviceLoadState } from '@/lib/legacy/devices/query'
import { LegacyDeviceRegionError } from './device-region-error'

const SORT_LABELS: Record<LegacyDeviceSort, string> = {
  lastSeenAt: 'Last seen',
  hostname: 'Hostname',
  site: 'Site',
  managementIp: 'Management IP',
  model: 'Model',
}

function LegacyDeviceFiltersContent({
  params,
  siteOptions,
  typeOptions,
}: {
  params: LegacyDevicePageParams
  siteOptions: string[]
  typeOptions: string[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    router.push(
      buildLegacyDevicePageUrl({
        ...params,
        query: read('query'),
        site: read('site'),
        deviceType: read('deviceType'),
        sort: (LEGACY_DEVICE_SORTS as readonly string[]).includes(read('sort'))
          ? (read('sort') as LegacyDeviceSort)
          : 'lastSeenAt',
        direction: read('dir') === 'asc' ? 'asc' : 'desc',
        page: 1,
      }),
    )
  }

  return (
    <form onSubmit={applyFilters} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <IconSearch
          size={13}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          name="query"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search device inventory…"
          className={SEARCH_INPUT_CLS}
        />
      </div>
      <select
        name="site"
        defaultValue={params.site}
        aria-label="Filter by site"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="">All sites</option>
        {siteOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        name="deviceType"
        defaultValue={params.deviceType}
        aria-label="Filter by device type"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="">All device types</option>
        {typeOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        name="sort"
        defaultValue={params.sort}
        aria-label="Sort devices"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        {LEGACY_DEVICE_SORTS.map((value) => (
          <option key={value} value={value}>
            {SORT_LABELS[value]}
          </option>
        ))}
      </select>
      <select
        name="dir"
        defaultValue={params.direction}
        aria-label="Sort direction"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
      <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">
        Apply
      </button>
    </form>
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
