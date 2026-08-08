'use client'

import { useRef, useState, useTransition } from 'react'
import {
  IconChevronDown,
  IconChevronUp,
  IconFilter2,
  IconPlugConnected,
  IconSearch,
} from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPageShell } from '@/components/legacy/LegacyPageShell'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import { normalizeLegacyInterfaceState } from '@/lib/legacy-ui/interfaces'
import type { LegacyPageSize } from '@/lib/legacy-ui/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import { LegacyInterfaceDrawer } from './LegacyInterfaceDrawer'
import {
  buildLegacyInterfaceUrl,
  nextLegacyInterfaceSort,
  type LegacyInterfaceListState,
  type LegacyInterfaceSortKey,
} from './list-state'

export interface LegacyInterfaceSampleRow {
  id: string
  collectedAt: string
  adminSt: string
  operSt: string
  speed: string
  inputErrors: string
  outputErrors: string
  crcErrors: string
  dInputErrors: string | null
  dOutputErrors: string | null
  dCrcErrors: string | null
}

export interface LegacyInterfaceRow {
  id: string
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  ifName: string
  description: string
  ipAddress: string | null
  prefixLength: number | null
  mtu: number | null
  speed: string
  adminSt: string
  operSt: string
  present: boolean
  firstSeenAt: string
  lastSeenAt: string
  crcWindowTotal: string | null
  sample: LegacyInterfaceSampleRow | null
}

interface VisibleCounters {
  input: string | null
  output: string | null
  crc: string | null
}

const SEGMENT_CLS = 'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors'

function operState(value: string) {
  const state = normalizeLegacyInterfaceState(value)

  if (state === 'down') {
    return <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400"><span className="size-1.5 shrink-0 rounded-full bg-red-500" />down</span>
  }

  return <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success"><span className="size-1.5 shrink-0 rounded-full bg-success-dot" />up</span>
}

function exactCounter(value: string | null): string {
  if (value === null) return '—'
  try { return BigInt(value).toLocaleString() } catch { return value }
}

function visibleCounters(row: LegacyInterfaceRow, state: LegacyInterfaceListState): VisibleCounters {
  return {
    input: state.mode === 'delta'
      ? row.sample?.dInputErrors ?? null
      : row.sample?.inputErrors ?? null,
    output: state.mode === 'delta'
      ? row.sample?.dOutputErrors ?? null
      : row.sample?.outputErrors ?? null,
    crc: state.view === 'crc'
      ? row.crcWindowTotal
      : state.mode === 'delta'
        ? row.sample?.dCrcErrors ?? null
        : row.sample?.crcErrors ?? null,
  }
}

function segmentClass(active: boolean): string {
  return `${SEGMENT_CLS} ${active
    ? 'bg-card text-foreground shadow-sm'
    : 'text-muted-foreground hover:text-foreground'}`
}

export function LegacyInterfacesClient({
  rows,
  total,
  page,
  pageSize,
  state,
  options,
  summaries,
}: {
  rows: LegacyInterfaceRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
  state: LegacyInterfaceListState
  options: { devices: Array<{ id: string; hostname: string; site: string }> }
  summaries: { total: number; down: number; absent: number; withHistory: number }
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<LegacyInterfaceRow | null>(null)
  const [search, setSearch] = useState(state.query)
  const [previousQuery, setPreviousQuery] = useState(state.query)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  if (state.query !== previousQuery) {
    setPreviousQuery(state.query)
    setSearch(state.query)
  }

  function navigate(overrides: Partial<LegacyInterfaceListState>) {
    const nextState = {
      ...state,
      ...overrides,
      page: overrides.page ?? 1,
    }
    startTransition(() => router.replace(buildLegacyInterfaceUrl(nextState)))
  }

  function handleSearch(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => navigate({ query: value }), 300)
  }

  function handleDeviceToggle(deviceId: string) {
    const deviceIds = state.deviceIds.includes(deviceId)
      ? state.deviceIds.filter(id => id !== deviceId)
      : [...state.deviceIds, deviceId]
    navigate({ deviceIds })
  }

  function handleSort(key: LegacyInterfaceSortKey) {
    const next = nextLegacyInterfaceSort(state.sortKey, state.sortDirection, key)
    navigate({ sortKey: next.key, sortDirection: next.direction })
  }

  const summary = [
    ['Interfaces', summaries.total],
    ['Operational down', summaries.down],
    ['No longer present', summaries.absent],
    ['With history', summaries.withHistory],
  ] as const
  const activeFilterCount = state.deviceIds.length > 0 ? 1 : 0
  const counterPrefix = state.mode === 'delta' ? 'Δ ' : ''
  const tableHeaders: Array<{ label: string; key: LegacyInterfaceSortKey }> = [
    { label: 'Device', key: 'hostname' },
    { label: 'Interface', key: 'ifName' },
    { label: 'Description', key: 'description' },
    { label: 'IP address', key: 'ipAddress' },
    { label: 'Admin', key: 'adminSt' },
    { label: 'Operational', key: 'operSt' },
    { label: `${counterPrefix}input`, key: 'inputErrors' },
    { label: `${counterPrefix}output`, key: 'outputErrors' },
    {
      label: state.view === 'crc' ? `CRC (${state.window})` : `${counterPrefix}CRC`,
      key: 'crcErrors',
    },
    { label: 'Collected', key: 'collectedAt' },
  ]
  const filtered = Boolean(state.query || state.deviceIds.length)
  const emptyCopy = filtered
    ? {
        title: 'No interfaces match the current filters',
        description: 'Try adjusting the search or selected devices.',
      }
    : state.view === 'crc'
      ? {
          title: `No increasing CRC errors in the last ${state.window === '30d' ? '30 days' : '7 days'}`,
          description: 'All present interfaces report zero CRC error increases in this window.',
        }
      : state.view === 'state-changed'
        ? {
            title: `No state changes in the last ${state.window === '30d' ? '30 days' : '7 days'}`,
            description: 'No present interface changed its Admin or Oper state in this window.',
          }
        : {
            title: 'No legacy interfaces found',
            description: 'Run legacy_sync.py monitor or all to collect interfaces.',
          }

  return <LegacyPageShell title="Legacy Interfaces" description="Current interface inventory, exact counters, and historical trends">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>)}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1 md:w-72 md:flex-none">
        <IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={search}
          onChange={event => handleSearch(event.target.value)}
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
            {activeFilterCount > 0 && <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground shadow-sm">{activeFilterCount}</span>}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="start">
          <DropdownMenuLabel>Device</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.devices.length === 0
            ? <DropdownMenuItem disabled>No values available</DropdownMenuItem>
            : options.devices.map(device => <DropdownMenuCheckboxItem
                key={device.id}
                checked={state.deviceIds.includes(device.id)}
                onCheckedChange={() => handleDeviceToggle(device.id)}
                onSelect={event => event.preventDefault()}
              >
                {device.hostname} · {device.site}
              </DropdownMenuCheckboxItem>)}
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
        {([
          { label: 'All', value: 'all' },
          { label: 'Counting CRC', value: 'crc' },
          { label: 'State Changes', value: 'state-changed' },
        ] as const).map(view => <button
          key={view.value}
          type="button"
          aria-pressed={state.view === view.value}
          onClick={() => navigate({ view: view.value })}
          className={segmentClass(state.view === view.value)}
        >{view.label}</button>)}
      </div>

      <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
        {(['delta', 'current'] as const).map(mode => <button
          key={mode}
          type="button"
          aria-pressed={state.mode === mode}
          onClick={() => navigate({ mode })}
          className={segmentClass(state.mode === mode)}
        >{mode === 'delta' ? 'Delta' : 'Current'}</button>)}
      </div>

      {state.view !== 'all' && <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
        {(['7d', '30d'] as const).map(window => <button
          key={window}
          type="button"
          aria-pressed={state.window === window}
          onClick={() => navigate({ window })}
          className={segmentClass(state.window === window)}
        >{window}</button>)}
      </div>}
    </div>

    {rows.length === 0 && !isPending
      ? <LegacyEmptyState icon={<IconPlugConnected size={24} />} title={emptyCopy.title} description={emptyCopy.description} />
      : <div className={[
          'overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-opacity duration-150',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}>
          <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block">
            <table className="w-full text-xs">
              <thead><tr>{tableHeaders.map(header => <th
                key={header.key}
                aria-sort={state.sortKey === header.key
                  ? state.sortDirection === 'asc' ? 'ascending' : 'descending'
                  : undefined}
                className={DENSE_TABLE_HEAD_CLS}
              ><button
                type="button"
                onClick={() => handleSort(header.key)}
                className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-foreground"
              ><span>{header.label}</span>{state.sortKey === header.key
                ? state.sortDirection === 'asc'
                  ? <IconChevronUp size={11} stroke={2} />
                  : <IconChevronDown size={11} stroke={2} />
                : <span className="w-[11px]" aria-hidden="true" />}</button></th>)}</tr></thead>
              <tbody>{rows.map(row => {
                const counters = visibleCounters(row, state)
                return <tr key={row.id} onClick={() => setSelected(row)} className="cursor-pointer border-b border-border/70 hover:bg-muted/60">
                  <td className="px-4 py-3 font-semibold text-foreground">{row.hostname}<div className="text-[10px] font-normal text-faint">{row.site}</div></td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-foreground">{row.ifName}</td>
                  <td className="max-w-52 truncate px-4 py-3 text-subtle">{row.description || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.ipAddress ? `${row.ipAddress}${row.prefixLength === null ? '' : `/${row.prefixLength}`}` : '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{normalizeLegacyInterfaceState(row.adminSt)}</td>
                  <td className="px-4 py-3">{operState(row.operSt)}</td>
                  <td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(counters.input)}</td>
                  <td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(counters.output)}</td>
                  <td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(counters.crc)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-subtle">{row.sample ? new Date(row.sample.collectedAt).toLocaleString() : 'No samples'}</td>
                </tr>
              })}</tbody>
            </table>
          </div>
          <div className="space-y-2 p-3 md:hidden">{rows.map(row => {
            const counters = visibleCounters(row, state)
            return <DataCard key={row.id} onClick={() => setSelected(row)}>
              <DataCardHeader trailing={operState(row.operSt)}><DataCardTitle>{row.hostname} · {row.ifName}</DataCardTitle></DataCardHeader>
              <DataCardBody>
                <DataCardRow label="Site" value={row.site} />
                <DataCardRow label="Description" value={row.description || 'Not reported'} />
                <DataCardRow label={`${state.mode === 'delta' ? 'Error deltas' : 'Errors'} (in / out / CRC)`} value={`${exactCounter(counters.input)} / ${exactCounter(counters.output)} / ${exactCounter(counters.crc)}`} />
              </DataCardBody>
            </DataCard>
          })}</div>
          <LegacyPagination page={page} pageSize={pageSize} total={total} />
        </div>}
    <LegacyInterfaceDrawer key={selected?.id ?? 'closed'} selected={selected} onClose={() => setSelected(null)} />
  </LegacyPageShell>
}
