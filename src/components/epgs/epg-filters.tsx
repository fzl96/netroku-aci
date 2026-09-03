'use client'

import { use, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconFilter2 } from '@tabler/icons-react'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { countActiveEpgFilterGroups } from '@/lib/epgs/params'
import type { EpgLoadState, EpgOverviewPayload } from '@/lib/epgs/query'
import { EpgRegionError } from './epg-region-error'
import { buildEpgUrl } from './epg-url'

function fmt(value: string | null) {
  return value ? new Date(value).toLocaleString() : '—'
}

export function EpgFilters({
  dataPromise,
}: {
  dataPromise: Promise<EpgLoadState<EpgOverviewPayload>>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EpgRegionError region="overview" />
  if (state.kind === 'inactive') return null

  const { params, overview } = state.data
  const active = countActiveEpgFilterGroups({
    tenant: params.tenants,
    ap: params.appProfiles,
    node: params.nodes,
  })

  function filter(key: 'tenant' | 'ap' | 'node', value: string[]) {
    const url = buildEpgUrl(params, { [key]: value, page: 1 })
    startTransition(() => router.replace(url, { scroll: false }))
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Filter EPGs"
            disabled={isPending}
            className={`relative flex size-9 items-center justify-center rounded-lg border ${active ? 'border-primary bg-primary/8' : 'border-border bg-muted'}`}
          >
            <IconFilter2 size={15} />
            {active > 0 && (
              <span className="absolute -top-1.5 -right-1.5 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
                {active}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44" align="start">
          <DropdownMenuLabel>Filters</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <FilterSubmenu
            label="Tenant"
            value={params.tenants}
            options={overview.choices.tenants}
            onChange={(value) => filter('tenant', value)}
            disabled={isPending}
            searchable
          />
          <FilterSubmenu
            label="App Profile"
            value={params.appProfiles}
            options={overview.choices.appProfiles}
            onChange={(value) => filter('ap', value)}
            disabled={isPending}
            searchable
          />
          {params.view === 'port' && (
            <FilterSubmenu
              label="Node"
              value={params.nodes}
              options={overview.choices.nodes}
              onChange={(value) => filter('node', value)}
              disabled={isPending}
              searchable
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="text-xs text-subtle" title="Last EPG sync">
        synced {fmt(overview.lastEpgSyncAt)}
      </span>
    </section>
  )
}
