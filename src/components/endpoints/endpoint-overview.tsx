'use client'

import { use, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconFilter2, IconSearch } from '@tabler/icons-react'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildEndpointPageUrl,
  countActiveEndpointFilterGroups,
  type EndpointPageParams,
  type EndpointPageSize,
  type EndpointStatusFilter,
  type EndpointView,
} from '@/lib/endpoints/params'
import type {
  EndpointLoadState,
  EndpointOverviewData,
  EndpointOverviewPayload,
} from '@/lib/endpoints/query'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import { EndpointRegionError } from './endpoint-region-error'

type UrlOverrides = {
  apic?: string
  view?: EndpointView
  query?: string
  page?: number
  pageSize?: EndpointPageSize
  vlan?: string[]
  node?: string[]
  iface?: string[]
  status?: string[]
}

function endpointUrl(params: EndpointPageParams, overrides: UrlOverrides): string {
  const view = overrides.view ?? params.view
  return buildEndpointPageUrl({
    hostId: overrides.apic ?? params.hostId,
    view,
    query: overrides.query ?? params.query,
    page: overrides.page ?? params.page,
    pageSize: overrides.pageSize ?? params.pageSize,
    vlans: overrides.vlan ?? params.vlans,
    nodes: overrides.node ?? params.nodes,
    interfaces: view === 'endpoint' ? (overrides.iface ?? params.interfaces) : [],
    statuses: (overrides.status ?? params.statuses).filter(
      (value): value is EndpointStatusFilter => value === 'active' || value === 'historical',
    ),
  })
}

function EndpointOverviewContent({
  params,
  overview,
}: {
  params: EndpointPageParams
  overview: EndpointOverviewData
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [searchValue, setSearchValue] = useState(params.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noun = params.view === 'endpoint' ? 'endpoints' : 'ports'
  const activeFilterGroupCount = countActiveEndpointFilterGroups(
    {
      vlan: params.vlans,
      node: params.nodes,
      iface: params.interfaces,
      status: params.statuses,
    },
    params.view,
  )

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  function navigate(overrides: UrlOverrides) {
    startTransition(() => router.replace(endpointUrl(params, overrides), { scroll: false }))
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => navigate({ query: value, page: 1 }), 300)
  }

  function handleFilterChange(key: 'vlan' | 'node' | 'iface' | 'status', value: string[]) {
    navigate({ [key]: value, page: 1 })
  }

  return (
    <section
      className={`flex flex-wrap items-center justify-between gap-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
          {(
            [
              ['endpoint', 'By Endpoint'],
              ['port', 'By Port'],
            ] as const
          ).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => navigate({ view, page: 1 })}
              disabled={isPending}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${params.view === view ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[140px] flex-1 md:w-56 md:flex-none">
          <IconSearch
            size={13}
            stroke={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(event) => handleSearchChange(event.target.value)}
            placeholder={
              params.view === 'endpoint' ? 'Search MAC, IP, VLAN…' : 'Search node, port, MAC, IP…'
            }
            className={SEARCH_INPUT_CLS}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`Filter ${noun}`}
              aria-label={`Filter ${noun}`}
              disabled={isPending}
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-40 ${activeFilterGroupCount > 0 ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              <IconFilter2 size={15} stroke={1.75} />
              {activeFilterGroupCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground shadow-sm">
                  {activeFilterGroupCount}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-44" align="start">
            <DropdownMenuLabel>Filters</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <FilterSubmenu
              label="VLAN"
              value={params.vlans}
              options={overview.choices.vlans}
              onChange={(value) => handleFilterChange('vlan', value)}
              disabled={isPending}
              searchable
            />
            <FilterSubmenu
              label="Node"
              value={params.nodes}
              options={overview.choices.nodes}
              onChange={(value) => handleFilterChange('node', value)}
              disabled={isPending}
            />
            {params.view === 'endpoint' && (
              <FilterSubmenu
                label="Interface"
                value={params.interfaces}
                options={overview.choices.interfaces}
                onChange={(value) => handleFilterChange('iface', value)}
                disabled={isPending}
                searchable
              />
            )}
            <FilterSubmenu
              label="Status"
              value={params.statuses}
              options={['active', 'historical']}
              onChange={(value) => handleFilterChange('status', value)}
              disabled={isPending}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">
        <span>
          <span className="font-semibold text-success">{overview.activeTotal}</span> active
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-semibold text-foreground">{overview.historicalTotal}</span>{' '}
          historical
        </span>
      </div>
    </section>
  )
}

export function EndpointOverview({
  dataPromise,
}: {
  dataPromise: Promise<EndpointLoadState<EndpointOverviewPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EndpointRegionError region="overview" />
  if (state.kind === 'inactive') return null

  return (
    <EndpointOverviewContent
      key={state.data.params.query}
      params={state.data.params}
      overview={state.data.overview}
    />
  )
}
