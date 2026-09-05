'use client'

import { type FormEvent, use, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyEndpointPageUrl,
  LEGACY_ENDPOINT_SORTS,
  type LegacyEndpointPageParams,
  type LegacyEndpointSort,
  type LegacyEndpointStatusFilter,
} from '@/lib/legacy/endpoints/params'
import type {
  LegacyEndpointFilterOptions,
  LegacyEndpointFiltersPayload,
  LegacyEndpointLoadState,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointRegionError } from './endpoint-region-error'

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground'

const SORT_LABELS: Record<LegacyEndpointSort, string> = {
  lastSeen: 'Last seen',
  firstSeen: 'First seen',
  mac: 'MAC',
  vlan: 'VLAN',
  interface: 'Interface',
  cleared: 'Cleared time',
}

function LegacyEndpointFiltersContent({
  params,
  options,
}: {
  params: LegacyEndpointPageParams
  options: LegacyEndpointFilterOptions
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    const status = read('status')
    router.push(
      buildLegacyEndpointPageUrl({
        ...params,
        query: read('query'),
        site: read('site'),
        device: read('device'),
        vlan: read('vlan'),
        interface: read('interface'),
        status:
          status === 'historical' || status === 'all'
            ? (status as LegacyEndpointStatusFilter)
            : 'active',
        sort: (LEGACY_ENDPOINT_SORTS as readonly string[]).includes(read('sort'))
          ? (read('sort') as LegacyEndpointSort)
          : 'lastSeen',
        direction: read('dir') === 'asc' ? 'asc' : 'desc',
        page: 1,
      }),
    )
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-xs">
        <IconSearch
          size={13}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          name="query"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search MAC, IP, VLAN, or device…"
          className={SEARCH_INPUT_CLS}
        />
      </div>
      <select
        name="site"
        defaultValue={params.site}
        aria-label="Filter by site"
        className={SELECT_CLS}
      >
        <option value="">All sites</option>
        {options.sites.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        name="device"
        defaultValue={params.device}
        aria-label="Filter by device"
        className={SELECT_CLS}
      >
        <option value="">All devices</option>
        {options.devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.hostname} · {device.site}
          </option>
        ))}
      </select>
      <select
        name="vlan"
        defaultValue={params.vlan}
        aria-label="Filter by VLAN"
        className={SELECT_CLS}
      >
        <option value="">All VLANs</option>
        {options.vlans.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        name="interface"
        defaultValue={params.interface}
        aria-label="Filter by interface"
        className={SELECT_CLS}
      >
        <option value="">All interfaces</option>
        {options.interfaces.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        name="status"
        defaultValue={params.status}
        aria-label="Filter by lifecycle"
        className={SELECT_CLS}
      >
        <option value="active">Active</option>
        <option value="historical">Historical</option>
        <option value="all">All lifecycle records</option>
      </select>
      <select
        name="sort"
        defaultValue={params.sort}
        aria-label="Sort endpoints"
        className={SELECT_CLS}
      >
        {LEGACY_ENDPOINT_SORTS.map((value) => (
          <option key={value} value={value}>
            {SORT_LABELS[value]}
          </option>
        ))}
      </select>
      <select
        name="dir"
        defaultValue={params.direction}
        aria-label="Sort direction"
        className={SELECT_CLS}
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
