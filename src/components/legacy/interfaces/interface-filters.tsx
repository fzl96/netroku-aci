'use client'

import { use, useEffect, useRef, useState, useTransition } from 'react'
import { IconFilter2, IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyInterfaceUrl,
  mergeLegacyInterfaceListState,
  type LegacyInterfaceListState,
} from '@/lib/legacy/interfaces/params'
import type {
  LegacyInterfaceDeviceOption,
  LegacyInterfaceFiltersPayload,
  LegacyInterfaceLoadState,
} from '@/lib/legacy/interfaces/query'
import { LegacyInterfaceRegionError } from './interface-region-error'

const SEGMENT_CLS = 'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors'

function segmentClass(active: boolean): string {
  return `${SEGMENT_CLS} ${
    active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
  }`
}

function LegacyInterfaceFiltersContent({
  state,
  devices,
}: {
  state: LegacyInterfaceListState
  devices: LegacyInterfaceDeviceOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(state.query)
  const [previousQuery, setPreviousQuery] = useState(state.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentStateRef = useRef(state)

  useEffect(() => {
    if (!isPending) currentStateRef.current = state
  }, [isPending, state])

  if (state.query !== previousQuery) {
    setPreviousQuery(state.query)
    setSearch(state.query)
  }

  function navigate(url: string) {
    startTransition(() => router.replace(url))
  }

  function apply(overrides: Partial<LegacyInterfaceListState>) {
    const nextState = mergeLegacyInterfaceListState(currentStateRef.current, overrides)
    currentStateRef.current = nextState
    navigate(buildLegacyInterfaceUrl(nextState))
  }

  function handleSearch(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => apply({ query: value }), 300)
  }

  function handleDeviceToggle(deviceId: string) {
    const { deviceIds: currentDeviceIds } = currentStateRef.current
    const deviceIds = currentDeviceIds.includes(deviceId)
      ? currentDeviceIds.filter((id) => id !== deviceId)
      : [...currentDeviceIds, deviceId]
    apply({ deviceIds })
  }

  const activeFilterCount = state.deviceIds.length > 0 ? 1 : 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 md:w-72 md:flex-none">
        <IconSearch
          size={13}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          value={search}
          onChange={(event) => handleSearch(event.target.value)}
          placeholder="Search interface or device…"
          className={SEARCH_INPUT_CLS}
        />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Filter interfaces by device"
            aria-label="Filter interfaces by device"
            disabled={isPending}
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
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel>Device</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {devices.length === 0 ? (
            <DropdownMenuItem disabled>No values available</DropdownMenuItem>
          ) : (
            devices.map((device) => (
              <DropdownMenuCheckboxItem
                key={device.id}
                checked={state.deviceIds.includes(device.id)}
                onCheckedChange={() => handleDeviceToggle(device.id)}
                onSelect={(event) => event.preventDefault()}
              >
                {device.hostname} · {device.site}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
        {(
          [
            { label: 'All', value: 'all' },
            { label: 'Counting CRC', value: 'crc' },
            { label: 'State Changes', value: 'state-changed' },
          ] as const
        ).map((view) => (
          <button
            key={view.value}
            type="button"
            aria-pressed={state.view === view.value}
            onClick={() => apply({ view: view.value })}
            className={segmentClass(state.view === view.value)}
          >
            {view.label}
          </button>
        ))}
      </div>

      <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
        {(['delta', 'current'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={state.mode === mode}
            onClick={() => apply({ mode })}
            className={segmentClass(state.mode === mode)}
          >
            {mode === 'delta' ? 'Delta' : 'Current'}
          </button>
        ))}
      </div>

      {state.view !== 'all' && (
        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          {(['7d', '30d'] as const).map((window) => (
            <button
              key={window}
              type="button"
              aria-pressed={state.window === window}
              onClick={() => apply({ window })}
              className={segmentClass(state.window === window)}
            >
              {window}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function LegacyInterfaceFilters({
  dataPromise,
}: {
  dataPromise: Promise<LegacyInterfaceLoadState<LegacyInterfaceFiltersPayload>>
}) {
  const loadState = use(dataPromise)
  if (loadState.kind === 'unauthorized') return <LegacyInterfaceRegionError region="filters" />

  const { state, devices } = loadState.data
  return <LegacyInterfaceFiltersContent state={state} devices={devices} />
}
