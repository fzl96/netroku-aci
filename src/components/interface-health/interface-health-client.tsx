'use client'

import type { FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconRefresh,
  IconSearch,
  IconServer,
  IconFilter2,
  IconDownload,
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
  IconChevronUp,
} from '@tabler/icons-react'
import { useApicHosts } from '@/components/ApicHostsProvider'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { selectVisibleCounters, type CounterMode } from '@/lib/interface-health/counter-mode'
import {
  buildInterfaceHealthPageUrl,
  INTERFACE_PAGE_SIZES,
  type InterfaceHealthPageParams,
  type InterfacePageSize,
  type InterfaceTableSort,
  type InterfaceWindow,
} from '@/lib/interface-health/params'
import type { InterfaceSortDirection, TableSortKey } from '@/lib/interface-health/sort'
import type { InterfaceResultsData, InterfaceRow } from '@/lib/interface-health/query'
import type { InterfaceView } from '@/lib/interface-health/interface-query'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import {
  DataCard,
  DataCardHeader,
  DataCardTitle,
  DataCardBody,
  DataCardRow,
} from '@/components/ui/data-card'
import type { SelectedInterface } from './interface-error-trend-drawer'
import type { CrcTrendPoint } from '@/lib/interface-health/crc-trend'

// recharts is heavy and only needed once the trend drawer is opened or CRC view is selected,
// so it is code-split out of the initial interface-health bundle.
const InterfaceErrorTrendDrawer = dynamic(
  () => import('./interface-error-trend-drawer').then((m) => m.InterfaceErrorTrendDrawer),
  { ssr: false },
)

const InterfaceCrcTrendChart = dynamic(
  () => import('./interface-crc-trend-chart').then((m) => m.InterfaceCrcTrendChart),
  { ssr: false },
)

const PAGE_SIZE_OPTIONS: { label: string; value: InterfacePageSize }[] = [
  ...INTERFACE_PAGE_SIZES.map((value) => ({
    label: String(value),
    value: value as InterfacePageSize,
  })),
  { label: 'All', value: 'all' as const },
]

// ─── Navigation ───────────────────────────────────────────────────────────────

type Navigation = { isPending: boolean; navigate: (url: string) => void; refresh: () => void }
const NavigationContext = createContext<Navigation | null>(null)

function useInterfaceNavigation(): Navigation {
  const value = useContext(NavigationContext)
  if (!value) throw new Error('Interface navigation requires InterfaceHealthFrame')
  return value
}

/** Every region navigates through the shell's single transition so the whole
 *  page shows one coherent pending state for a URL change. */
function interfaceUrl(
  params: InterfaceHealthPageParams,
  overrides: Partial<InterfaceHealthPageParams>,
): string {
  return buildInterfaceHealthPageUrl({ ...params, ...overrides })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function fmtRelative(date: string | null): string {
  if (!date) return 'never'
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

function fmtCount(value: string | null): string {
  if (value === null) return '—'
  // Plain decimal — no abbreviation. Caller decides on highlighting.
  return value
}

function fmtDelta(value: string | null): string {
  if (value === null) return 'Reset'
  return value
}

function isNonZero(value: string | null): boolean {
  if (value === null) return false
  try {
    return BigInt(value) > BigInt(0)
  } catch {
    return false
  }
}

export function OperStBadge({ st, adminSt }: { st: string; adminSt?: string }) {
  const up = st.toLowerCase() === 'up'
  const adminUp = adminSt?.toLowerCase() === 'up'
  const operDown = !up && (adminUp || st.length > 0)

  if (operDown) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        {st || 'down'}
      </span>
    )
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-[10px] font-medium',
        up ? 'text-success' : st ? 'text-faint' : 'text-muted-foreground',
      ].join(' ')}
    >
      <span
        className={['h-1.5 w-1.5 shrink-0 rounded-full', up ? 'bg-success-dot' : 'bg-border'].join(
          ' ',
        )}
      />
      {st || '—'}
    </span>
  )
}

function TableSkeleton({ columns = 8 }: { columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border-faint last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <td
              key={j}
              className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(
                ' ',
              )}
            >
              <div
                className="h-2.5 animate-pulse rounded-sm bg-muted"
                style={{ width: `${35 + ((i * 13 + j * 17) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export function InterfaceHealthFrame({
  syncStatus,
  actions,
  children,
}: {
  syncStatus: ReactNode
  actions: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigation: Navigation = {
    isPending,
    navigate: (url: string) => startTransition(() => router.replace(url)),
    refresh: () => startTransition(() => router.refresh()),
  }

  return (
    <NavigationContext.Provider value={navigation}>
      <div className="min-h-full bg-background">
        <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
          <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
            <div>
              <h1 className="font-serif text-[18px] font-semibold text-foreground">Interfaces</h1>
              <p className="mt-0.5 text-xs text-subtle">
                Status, error, and utilisation counters
                {syncStatus}
              </p>
            </div>
            {actions}
          </div>
        </div>

        <div className="space-y-4 px-4 py-4 md:px-8 md:py-6">{children}</div>
      </div>
    </NavigationContext.Provider>
  )
}

export function InterfaceSyncStatusClient({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  return <> · last synced {fmtRelative(lastSyncedAt)}</>
}

function HostSelect({
  params,
  className,
}: {
  params: InterfaceHealthPageParams
  className: string
}) {
  const apicHosts = useApicHosts()
  const { isPending, navigate } = useInterfaceNavigation()
  return (
    <select
      value={params.hostId}
      onChange={(e) =>
        navigate(e.target.value ? `/interface-health?apic=${e.target.value}` : '/interface-health')
      }
      disabled={isPending}
      className={className}
    >
      <option value="">Select APIC host…</option>
      {apicHosts.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name} ({h.host})
        </option>
      ))}
    </select>
  )
}

export function InterfaceHeaderActionsClient({ params }: { params: InterfaceHealthPageParams }) {
  const apicHosts = useApicHosts()
  const { isPending, refresh } = useInterfaceNavigation()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const selectedHost = apicHosts.find((host) => host.id === params.hostId)
  const loading = isPending || syncing

  async function handleResync(credentials: { username: string; password: string }) {
    if (!params.hostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/interfaces/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = (await res.json()) as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} interfaces (${data.total} total)`)
      refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (!params.hostId) return
    setExporting(true)
    try {
      const res = await fetch('/api/interfaces/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apicHostId: params.hostId,
          node: params.nodes.length > 0 ? params.nodes : undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const m = /filename="([^"]+)"/.exec(disposition)
      link.download = m?.[1] ?? 'interfaces.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <HostSelect
        params={params}
        className={[
          'rounded-lg border border-border bg-muted text-xs',
          'px-3 py-2 text-foreground outline-none',
          'focus:border-primary focus:ring-2 focus:ring-primary/10',
          'min-w-0 flex-1 md:min-w-[180px] md:flex-none',
          'transition-opacity disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      />

      <button
        onClick={() => setCredentialOpen(true)}
        disabled={!params.hostId || syncing}
        title="Resync interfaces from APIC"
        className={[
          'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors',
          params.hostId && !syncing
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'cursor-not-allowed bg-muted text-faint',
        ].join(' ')}
      >
        <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>

      <button
        onClick={handleExport}
        disabled={!params.hostId || exporting}
        title="Export interface samples to CSV"
        className={[
          'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
          params.hostId && !exporting
            ? 'border-border text-foreground hover:bg-muted'
            : 'cursor-not-allowed border-border text-faint',
        ].join(' ')}
      >
        <IconDownload size={12} stroke={1.75} />
        {exporting ? 'Exporting…' : 'Export'}
      </button>

      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync interfaces"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}

export function NoInterfaceHost() {
  const apicHosts = useApicHosts()
  const params: InterfaceHealthPageParams = {
    hostId: '',
    query: '',
    nodes: [],
    page: 1,
    pageSize: 50,
    view: 'all',
    window: '7d',
    counterMode: 'delta',
    sort: { kind: 'natural' },
  }
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="relative mb-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <IconServer size={24} stroke={1.25} className="text-faint" />
        </div>
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-background bg-border" />
      </div>
      <h2 className="mb-1 font-serif text-base font-semibold text-foreground">
        No APIC host selected
      </h2>
      <p className="mb-6 max-w-[260px] text-xs leading-relaxed text-subtle">
        {apicHosts.length === 0
          ? 'No APIC hosts configured yet. Add one in Settings to get started.'
          : 'Choose a host to view its interface inventory.'}
      </p>
      {apicHosts.length > 0 && (
        <HostSelect
          params={params}
          className={[
            'rounded-lg border border-border bg-muted text-xs',
            'cursor-pointer px-3 py-2 text-foreground outline-none',
            'focus:border-primary focus:ring-2 focus:ring-primary/10',
            'min-w-[220px] transition-colors',
            'transition-opacity disabled:cursor-not-allowed disabled:opacity-60',
          ].join(' ')}
        />
      )}
    </div>
  )
}

// ─── Controls ─────────────────────────────────────────────────────────────────

export function InterfaceControlsClient({
  params,
  nodeFilter,
  summary,
}: {
  params: InterfaceHealthPageParams
  nodeFilter: ReactNode
  summary: ReactNode
}) {
  const { isPending, navigate } = useInterfaceNavigation()
  const [searchValue, setSearchValue] = useState(params.query)
  const [previousQuery, setPreviousQuery] = useState(params.query)
  const [lastDispatchedQuery, setLastDispatchedQuery] = useState(params.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when query changes via back/forward navigation, but ignore the
  // echo from our own debounced router.replace so in-flight typing isn't clobbered.
  if (params.query !== previousQuery) {
    setPreviousQuery(params.query)
    if (params.query !== lastDispatchedQuery) {
      setSearchValue(params.query)
    }
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLastDispatchedQuery(value.trim())
      navigate(interfaceUrl(params, { query: value.trim(), page: 1 }))
    }, 300)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
        <div className="relative min-w-[140px] flex-1 md:w-56 md:flex-none">
          <IconSearch
            size={13}
            stroke={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search node, ifName, description…"
            className={SEARCH_INPUT_CLS}
          />
        </div>

        {nodeFilter}

        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              { label: 'All', value: 'all' },
              { label: 'Counting CRC', value: 'crc' },
              { label: 'State Changes', value: 'state-changed' },
            ] as const
          ).map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={params.view === v.value}
              onClick={() =>
                navigate(interfaceUrl(params, { view: v.value as InterfaceView, page: 1 }))
              }
              className={[
                'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                params.view === v.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          {(['delta', 'current'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={params.counterMode === mode}
              onClick={() =>
                navigate(interfaceUrl(params, { counterMode: mode as CounterMode, page: 1 }))
              }
              className={[
                'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                params.counterMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {mode === 'delta' ? 'Delta' : 'Current'}
            </button>
          ))}
        </div>

        {(params.view === 'crc' || params.view === 'state-changed') && (
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
            {(['7d', '30d'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={params.window === w}
                onClick={() =>
                  navigate(interfaceUrl(params, { window: w as InterfaceWindow, page: 1 }))
                }
                disabled={isPending}
                className={[
                  'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  params.window === w
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">{summary}</div>
    </div>
  )
}

export function InterfaceNodeFilterClient({
  params,
  availableNodes,
}: {
  params: InterfaceHealthPageParams
  availableNodes: string[]
}) {
  const { isPending, navigate } = useInterfaceNavigation()
  const activeFilterCount = params.nodes.length > 0 ? 1 : 0

  function toggle(value: string) {
    const next = params.nodes.includes(value)
      ? params.nodes.filter((v) => v !== value)
      : [...params.nodes, value]
    navigate(interfaceUrl(params, { nodes: next, page: 1 }))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Filter interfaces"
          aria-label="Filter interfaces"
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
      <DropdownMenuContent className="w-44" align="start">
        <DropdownMenuLabel>Node</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {availableNodes.length === 0 ? (
          <DropdownMenuItem disabled>No values available</DropdownMenuItem>
        ) : (
          availableNodes.map((n) => (
            <DropdownMenuCheckboxItem
              key={n || '(blank)'}
              checked={params.nodes.includes(n)}
              onCheckedChange={() => toggle(n)}
              onSelect={(event) => event.preventDefault()}
            >
              {n || '(blank)'}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function InterfaceCrcTrendClient({ trend }: { trend: CrcTrendPoint[] }) {
  return <InterfaceCrcTrendChart trend={trend} />
}

// ─── Results ──────────────────────────────────────────────────────────────────

function nextSort(
  results: InterfaceResultsData,
  key: TableSortKey,
  counterMode: CounterMode,
): InterfaceTableSort {
  const direction: InterfaceSortDirection =
    results.sortKey === key && results.sortDirection === 'desc' ? 'asc' : 'desc'
  return key === 'crcWindowTotal'
    ? { kind: 'crc-window', direction }
    : { kind: 'counter', sort: { key, direction, mode: counterMode } }
}

function EmptyResults({
  params,
  className,
}: {
  params: InterfaceHealthPageParams
  className: string
}) {
  const filtered = Boolean(params.query) || params.nodes.length > 0
  if (params.view === 'crc' && !filtered) {
    return (
      <div className={className}>
        <p className="text-sm text-subtle">
          No interfaces with increasing CRC errors in the last{' '}
          {params.window === '30d' ? '30 days' : '7 days'}
        </p>
        <p className="mt-1 text-xs text-faint">
          All monitored interfaces are reporting zero CRC error increases
        </p>
      </div>
    )
  }
  if (filtered) {
    return (
      <div className={className}>
        <p className="text-sm text-subtle">No interfaces match the current filters</p>
        <p className="mt-1 text-xs text-faint">Try adjusting the search or filter values</p>
      </div>
    )
  }
  return (
    <div className={className}>
      <p className="text-sm text-subtle">No interfaces synced yet</p>
      <p className="mt-1 text-xs text-faint">
        Click <strong>Resync</strong> to pull the latest data from APIC
      </p>
    </div>
  )
}

export function InterfaceResultsClient({
  params,
  results,
}: {
  params: InterfaceHealthPageParams
  results: InterfaceResultsData
}) {
  const { isPending, navigate } = useInterfaceNavigation()
  const [selected, setSelected] = useState<SelectedInterface | null>(null)
  const [jumpValue, setJumpValue] = useState('')

  const { rows, total, page, pageSize, sortKey, sortDirection } = results
  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)

  function go(overrides: Partial<InterfaceHealthPageParams>) {
    navigate(interfaceUrl({ ...params, page }, overrides))
  }

  function handleJump(e: FormEvent) {
    e.preventDefault()
    const target = Number.parseInt(jumpValue, 10)
    if (target >= 1 && target <= totalPages) go({ page: target })
    setJumpValue('')
  }

  function openDrawer(row: InterfaceRow) {
    setSelected({
      id: row.id,
      node: row.node,
      ifName: row.ifName,
      description: row.description,
      operSt: row.operSt,
    })
  }

  const tableHeaders: { label: string; sortKey?: TableSortKey }[] = [
    { label: 'Node' },
    { label: 'Interface' },
    { label: 'Description' },
    { label: 'Admin' },
    { label: 'Oper' },
    { label: 'Speed' },
    { label: params.counterMode === 'delta' ? 'Rx err Δ' : 'Rx err', sortKey: 'rxErrors' },
    { label: params.counterMode === 'delta' ? 'Tx err Δ' : 'Tx err', sortKey: 'txErrors' },
    params.view === 'crc'
      ? { label: `CRC (${params.window})`, sortKey: 'crcWindowTotal' as TableSortKey }
      : {
          label: params.counterMode === 'delta' ? 'CRC Δ' : 'CRC',
          sortKey: 'rxCrcErrors' as TableSortKey,
        },
    { label: params.counterMode === 'delta' ? 'Align Δ' : 'Align', sortKey: 'rxAlignErrors' },
    { label: 'Last link change' },
    { label: 'Sampled' },
  ]

  return (
    <>
      <div
        className={[
          'hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block',
          'transition-opacity duration-150',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        {rows.length === 0 && !isPending ? (
          <EmptyResults params={params} className="px-4 py-14 text-center" />
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {tableHeaders.map((h) => (
                    <th
                      key={h.label}
                      aria-sort={
                        h.sortKey && sortKey === h.sortKey
                          ? sortDirection === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : undefined
                      }
                      className={DENSE_TABLE_HEAD_CLS}
                    >
                      {h.sortKey ? (
                        <button
                          type="button"
                          onClick={() =>
                            go({ sort: nextSort(results, h.sortKey!, params.counterMode), page: 1 })
                          }
                          className="inline-flex items-center gap-1 text-inherit transition-colors hover:text-foreground"
                        >
                          <span>{h.label}</span>
                          {sortKey === h.sortKey ? (
                            sortDirection === 'asc' ? (
                              <IconChevronUp size={11} stroke={2} />
                            ) : (
                              <IconChevronDown size={11} stroke={2} />
                            )
                          ) : (
                            <span className="w-[11px]" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        h.label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              {isPending ? (
                <TableSkeleton columns={tableHeaders.length} />
              ) : (
                <tbody>
                  {rows.map((r, i) => {
                    const visibleCounters = selectVisibleCounters(r, params.counterMode)

                    return (
                      <tr
                        key={r.id}
                        className="group animate-fade-up cursor-pointer border-b border-border-faint transition-colors duration-100 last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        onClick={() => openDrawer(r)}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 text-muted-foreground tabular-nums transition-colors duration-100 group-hover:border-l-primary">
                          {r.node || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{r.ifName}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {r.description || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{r.adminSt || '—'}</td>
                        <td className="px-4 py-2.5">
                          <OperStBadge st={r.operSt} adminSt={r.adminSt} />
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {r.operSpeed || '—'}
                        </td>
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.rxErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.rxErrors)
                            : fmtCount(visibleCounters.rxErrors)}
                        </td>
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.txErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.txErrors)
                            : fmtCount(visibleCounters.txErrors)}
                        </td>
                        {params.view === 'crc' ? (
                          <td className="px-4 py-2.5 tabular-nums">
                            <div
                              className={
                                isNonZero(r.crcWindowTotal)
                                  ? 'text-danger font-semibold'
                                  : 'text-faint'
                              }
                            >
                              {fmtCount(r.crcWindowTotal)}
                            </div>
                            <div className="mt-0.5 text-[10px] font-normal text-faint">
                              {r.dRxCrcErrors === null
                                ? 'reset'
                                : isNonZero(r.dRxCrcErrors)
                                  ? `+${r.dRxCrcErrors} last poll`
                                  : '0 last poll'}
                            </div>
                          </td>
                        ) : (
                          <td
                            className={[
                              'px-4 py-2.5 tabular-nums',
                              isNonZero(visibleCounters.rxCrcErrors)
                                ? 'text-danger font-semibold'
                                : 'text-faint',
                            ].join(' ')}
                          >
                            {params.counterMode === 'delta'
                              ? fmtDelta(visibleCounters.rxCrcErrors)
                              : fmtCount(visibleCounters.rxCrcErrors)}
                          </td>
                        )}
                        <td
                          className={[
                            'px-4 py-2.5 tabular-nums',
                            isNonZero(visibleCounters.rxAlignErrors)
                              ? 'text-danger font-semibold'
                              : 'text-faint',
                          ].join(' ')}
                        >
                          {params.counterMode === 'delta'
                            ? fmtDelta(visibleCounters.rxAlignErrors)
                            : fmtCount(visibleCounters.rxAlignErrors)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                          {r.hasRecentStateChange ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                              <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500" />
                              {fmtDate(r.lastLinkStChg)}
                            </span>
                          ) : (
                            <span className="text-faint">{fmtDate(r.lastLinkStChg)}</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                          {fmtRelative(r.lastSampledAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Mobile card list */}
      <div
        className={[
          'space-y-2 transition-opacity duration-150 md:hidden',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        {rows.length === 0 && !isPending ? (
          <EmptyResults
            params={params}
            className="rounded-2xl border border-border bg-card px-4 py-14 text-center"
          />
        ) : (
          rows.map((r) => {
            const visibleCounters = selectVisibleCounters(r, params.counterMode)
            const crcValue = params.view === 'crc' ? r.crcWindowTotal : visibleCounters.rxCrcErrors
            const fmtCounter = (v: string | null) =>
              params.counterMode === 'delta' && params.view !== 'crc' ? fmtDelta(v) : fmtCount(v)
            return (
              <DataCard key={r.id} role="button" tabIndex={0} onClick={() => openDrawer(r)}>
                <DataCardHeader trailing={<OperStBadge st={r.operSt} adminSt={r.adminSt} />}>
                  <DataCardTitle className="font-mono">{r.ifName}</DataCardTitle>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    Node {r.node || '—'}
                    {r.description ? ` · ${r.description}` : ''}
                  </p>
                </DataCardHeader>
                <DataCardBody>
                  <DataCardRow label="Speed" value={r.operSpeed || '—'} />
                  <DataCardRow
                    label="RX / TX err"
                    value={
                      <span
                        className={
                          isNonZero(visibleCounters.rxErrors) || isNonZero(visibleCounters.txErrors)
                            ? 'text-danger font-semibold'
                            : ''
                        }
                      >
                        {fmtCounter(visibleCounters.rxErrors)} /{' '}
                        {fmtCounter(visibleCounters.txErrors)}
                      </span>
                    }
                  />
                  <DataCardRow
                    label={params.view === 'crc' ? 'CRC (window)' : 'CRC err'}
                    value={
                      <span className={isNonZero(crcValue) ? 'text-danger font-semibold' : ''}>
                        {fmtCounter(crcValue)}
                      </span>
                    }
                  />
                  <DataCardRow label="Sampled" value={fmtRelative(r.lastSampledAt)} />
                </DataCardBody>
              </DataCard>
            )
          })
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="shrink-0 text-xs text-subtle">
            {pageSize === 'all'
              ? `Showing all ${total} interfaces`
              : `Showing ${rangeStart}–${rangeEnd} of ${total} interfaces`}
          </p>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="text-xs text-faint">Per page</span>
              <select
                value={String(pageSize)}
                onChange={(e) =>
                  go({
                    pageSize:
                      e.target.value === 'all'
                        ? 'all'
                        : (Number(e.target.value) as InterfacePageSize),
                    page: 1,
                  })
                }
                disabled={isPending}
                className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
              >
                {PAGE_SIZE_OPTIONS.map((o) => (
                  <option key={String(o.value)} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <>
                <div className="hidden h-4 w-px bg-border md:block" />
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => go({ page: page - 1 })}
                    disabled={page <= 1 || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <IconChevronLeft size={12} stroke={1.75} />
                    Prev
                  </button>

                  <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">
                    {page} / {totalPages}
                  </span>

                  <button
                    onClick={() => go({ page: page + 1 })}
                    disabled={page >= totalPages || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                    <IconChevronRight size={12} stroke={1.75} />
                  </button>

                  <div className="hidden h-4 w-px bg-border md:block" />

                  <form onSubmit={handleJump} className="hidden items-center gap-1 md:flex">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpValue}
                      onChange={(e) => setJumpValue(e.target.value)}
                      placeholder="Go to…"
                      className="w-20 [appearance:textfield] rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <button
                      type="submit"
                      disabled={!jumpValue || isPending}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Go
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <InterfaceErrorTrendDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  )
}
