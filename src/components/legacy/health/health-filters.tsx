'use client'

import { type FormEvent, use, useState } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyHealthPageUrl,
  LEGACY_HEALTH_SORTS,
  type LegacyHealthPageParams,
  type LegacyHealthSort,
} from '@/lib/legacy/health/params'
import type { LegacyHealthFiltersPayload, LegacyHealthLoadState } from '@/lib/legacy/health/query'
import { LegacyHealthRegionError } from './health-region-error'

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs'

const SORT_LABELS: Record<LegacyHealthSort, string> = {
  collected: 'Collected time',
  hostname: 'Hostname',
  site: 'Site',
  managementIp: 'Management IP',
}

function LegacyHealthFiltersContent({
  params,
  siteOptions,
}: {
  params: LegacyHealthPageParams
  siteOptions: string[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    router.push(
      buildLegacyHealthPageUrl({
        ...params,
        query: read('query'),
        site: read('site'),
        sort: (LEGACY_HEALTH_SORTS as readonly string[]).includes(read('sort'))
          ? (read('sort') as LegacyHealthSort)
          : 'collected',
        direction: read('dir') === 'asc' ? 'asc' : 'desc',
        page: 1,
      }),
    )
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1 sm:max-w-xs">
        <IconSearch size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input
          name="query"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search device or site…"
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
        {siteOptions.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        name="sort"
        defaultValue={params.sort}
        aria-label="Sort health"
        className={SELECT_CLS}
      >
        {LEGACY_HEALTH_SORTS.map((value) => (
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
