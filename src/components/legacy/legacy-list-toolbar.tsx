'use client'

import type { FormEvent, ReactNode } from 'react'
import { IconFilter2, IconSearch } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'

/** The list toolbar every legacy page shares: a debounced search field and a
 *  single filter menu. Kept in one place so the legacy pages read the same as
 *  the ACI ones. */
export function LegacyListToolbar({
  search,
  onSearchChange,
  onSearchSubmit,
  placeholder,
  searchLabel,
  filterLabel,
  activeFilterCount,
  pending = false,
  menuWidth = 'w-48',
  children,
}: {
  search: string
  onSearchChange: (value: string) => void
  onSearchSubmit: (value: string) => void
  placeholder: string
  searchLabel: string
  filterLabel: string
  activeFilterCount: number
  pending?: boolean
  menuWidth?: string
  children: ReactNode
}) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    onSearchSubmit(search)
  }

  return (
    <section aria-busy={pending} className="flex flex-wrap items-center gap-2">
      <form onSubmit={handleSubmit} className="relative min-w-56 flex-1 md:w-72 md:flex-none">
        <IconSearch
          size={13}
          stroke={1.75}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={placeholder}
          aria-label={searchLabel}
          className={SEARCH_INPUT_CLS}
        />
      </form>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={filterLabel}
            aria-label={filterLabel}
            disabled={pending}
            className={[
              'relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none',
              'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40',
              activeFilterCount > 0
                ? 'border-primary bg-primary/8 text-foreground'
                : 'border-border bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            <IconFilter2 size={15} stroke={1.75} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground shadow-sm">
                {activeFilterCount}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className={menuWidth} align="start">
          <DropdownMenuLabel>Filters</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </section>
  )
}

export function LegacyListToolbarSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-wrap items-center gap-2">
      <div className="h-8 min-w-56 flex-1 animate-pulse rounded-lg bg-muted md:w-72 md:flex-none" />
      <div className="size-9 shrink-0 animate-pulse rounded-lg bg-muted" />
    </div>
  )
}
