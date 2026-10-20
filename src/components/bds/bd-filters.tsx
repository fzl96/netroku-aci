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
import { buildBdPageUrl } from '@/lib/bds/params'
import type { BdLoadState, BdOverviewPayload } from '@/lib/bds/query'
import { BdRegionError } from './bd-region-error'

export function BdFilters({
  dataPromise,
}: {
  dataPromise: Promise<BdLoadState<BdOverviewPayload>>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const state = use(dataPromise)
  if (state.kind === 'error') return <BdRegionError region="overview" />
  if (state.kind !== 'ready') return null
  const { params, overview } = state.data
  const active = [params.tenant?.length, params.vrf?.length, params.routing].filter(Boolean).length
  const filter = (key: 'tenant' | 'vrf', values: string[]) =>
    startTransition(() =>
      router.replace(buildBdPageUrl({ ...params, [key]: values, page: 1 }), { scroll: false }),
    )
  return (
    <section className="flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Filter Bridge Domains"
            disabled={pending}
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
            value={params.tenant ?? []}
            options={overview.choices.tenants}
            onChange={(values) => filter('tenant', values)}
            disabled={pending}
            searchable
          />
          <FilterSubmenu
            label="VRF"
            value={params.vrf ?? []}
            options={overview.choices.vrfs}
            onChange={(values) => filter('vrf', values)}
            disabled={pending}
            searchable
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <select
        aria-label="Routing enabled"
        value={params.routing ?? ''}
        disabled={pending}
        onChange={(e) => {
          const routing = e.target.value as 'yes' | 'no' | ''
          startTransition(() =>
            router.replace(buildBdPageUrl({ ...params, routing: routing || undefined, page: 1 }), {
              scroll: false,
            }),
          )
        }}
        className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground"
      >
        <option value="">All routing modes</option>
        <option value="yes">Routing enabled</option>
        <option value="no">Routing disabled</option>
      </select>
      <span className="text-xs text-subtle" title="Last Bridge Domain sync">
        synced {overview.lastBdSyncAt ? new Date(overview.lastBdSyncAt).toLocaleString() : '—'}
      </span>
    </section>
  )
}
