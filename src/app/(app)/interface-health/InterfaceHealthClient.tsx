'use client'

import { useRef, useState, useTransition } from 'react'
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
import type { SafeApicHost } from '@/actions/apic-hosts'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import {
  selectVisibleCounters,
  type CounterFields,
  type CounterMode,
} from './counter-mode'
import type {
  InterfaceSortDirection,
  InterfaceSortKey,
} from './sort'
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
import type { SelectedInterface } from './InterfaceErrorTrendDrawer'

// recharts is heavy and only needed once the trend drawer is opened, so it is
// code-split out of the initial interface-health bundle.
const InterfaceErrorTrendDrawer = dynamic(
  () => import('./InterfaceErrorTrendDrawer').then((m) => m.InterfaceErrorTrendDrawer),
  { ssr: false },
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InterfaceRowProps extends CounterFields {
  id: string
  node: string
  ifName: string
  dn: string
  usage: string
  adminSt: string
  operSt: string
  operSpeed: string
  description: string
  lastLinkStChg: string | null
  lastSampledAt: string | null
  // BigInts serialised as decimal strings — see page.tsx / counter-mode.ts
  dRxDiscards: string | null
  dTxDiscards: string | null
}

type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

interface Props {
  apicHosts: SafeApicHost[]
  rows: InterfaceRowProps[]
  selectedHostId: string
  query: string
  filterNode: string[]
  availableNodes: string[]
  lastSyncedAt: string | null
  page: number
  total: number
  pageSize: PageSizeValue
  sortKey: InterfaceSortKey | null
  sortDirection: InterfaceSortDirection
  counterMode: CounterMode
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

function fmtBytes(value: string | null): string {
  if (value === null) return '—'
  try {
    const n = BigInt(value)
    if (n === BigInt(0)) return '0'
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    let unit = 0
    let v = Number(n)
    while (v >= 1024 && unit < units.length - 1) {
      v /= 1024
      unit++
    }
    return `${v.toFixed(v >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`
  } catch {
    return value
  }
}

function isNonZero(value: string | null): boolean {
  if (value === null) return false
  try {
    return BigInt(value) > BigInt(0)
  } catch {
    return false
  }
}

function OperStBadge({ st }: { st: string }) {
  const up = st === 'up'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-[10px] font-medium',
        up ? 'text-success' : st ? 'text-faint' : 'text-muted-foreground',
      ].join(' ')}
    >
      <span
        className={[
          'w-1.5 h-1.5 rounded-full shrink-0',
          up ? 'bg-success-dot' : 'bg-border',
        ].join(' ')}
      />
      {st || '—'}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InterfaceHealthClient({
  apicHosts,
  rows,
  selectedHostId,
  query,
  filterNode,
  availableNodes,
  lastSyncedAt,
  page,
  total,
  pageSize,
  sortKey,
  sortDirection,
  counterMode,
}: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<SelectedInterface | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDispatchedQuery = useRef(query)
  const [searchValue, setSearchValue] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)
  const [jumpValue, setJumpValue] = useState('')
  const selectedHost = apicHosts.find(host => host.id === selectedHostId)

  // Sync input when query changes via back/forward navigation, but ignore the
  // echo from our own debounced router.replace so in-flight typing isn't clobbered.
  if (query !== previousQuery) {
    setPreviousQuery(query)
    if (query !== lastDispatchedQuery.current) {
      setSearchValue(query)
    }
  }

  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)

  function buildUrl(overrides: {
    apic?: string
    query?: string
    node?: string[]
    page?: number
    pageSize?: PageSizeValue
    sort?: InterfaceSortKey | null
    dir?: InterfaceSortDirection
    counterMode?: CounterMode
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const n = overrides.node !== undefined ? overrides.node : filterNode
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize
    const s = overrides.sort !== undefined ? overrides.sort : sortKey
    const d = overrides.dir ?? sortDirection
    const mode = overrides.counterMode ?? counterMode

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (n.length > 0) params.set('node', n.join(','))
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    if (s) {
      params.set('sort', s)
      if (d !== 'desc') params.set('dir', d)
    }
    if (mode !== 'delta') params.set('mode', mode)
    const qs = params.toString()
    return `/interface-health${qs ? `?${qs}` : ''}`
  }

  function handleHostChange(hostId: string) {
    startTransition(() => {
      router.replace(hostId ? `/interface-health?apic=${hostId}` : '/interface-health')
    })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastDispatchedQuery.current = value.trim()
      startTransition(() => {
        router.replace(buildUrl({ query: value, page: 1 }))
      })
    }, 300)
  }

  function handleNodeToggle(value: string) {
    const next = filterNode.includes(value)
      ? filterNode.filter(v => v !== value)
      : [...filterNode, value]
    startTransition(() => {
      router.replace(buildUrl({ node: next, page: 1 }))
    })
  }

  function handlePage(next: number) {
    startTransition(() => {
      router.replace(buildUrl({ page: next }))
    })
  }

  function handlePageSizeChange(ps: PageSizeValue) {
    startTransition(() => {
      router.replace(buildUrl({ pageSize: ps, page: 1 }))
    })
  }

  function handleCounterModeChange(mode: CounterMode) {
    startTransition(() => {
      router.replace(buildUrl({ counterMode: mode, page: 1 }))
    })
  }

  function handleSort(key: InterfaceSortKey) {
    const nextDirection: InterfaceSortDirection =
      sortKey === key && sortDirection === 'desc' ? 'asc' : 'desc'
    startTransition(() => {
      router.replace(buildUrl({ sort: key, dir: nextDirection, page: 1 }))
    })
  }

  function handleJump(e: React.FormEvent) {
    e.preventDefault()
    const p = parseInt(jumpValue, 10)
    if (p >= 1 && p <= totalPages) handlePage(p)
    setJumpValue('')
  }

  async function handleResync(credentials: { username: string; password: string }) {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/interfaces/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = (await res.json()) as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} interfaces (${data.total} total)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (!selectedHostId) return
    setExporting(true)
    try {
      const res = await fetch('/api/interfaces/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apicHostId: selectedHostId,
          node: filterNode.length > 0 ? filterNode : undefined,
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

  const activeFilterCount = filterNode.length > 0 ? 1 : 0
  const loading = isPending || syncing
  const tableHeaders: ({ label: string; sortKey?: InterfaceSortKey })[] = [
    { label: 'Node' },
    { label: 'Interface' },
    { label: 'Description' },
    { label: 'Admin' },
    { label: 'Oper' },
    { label: 'Speed' },
    {
      label: counterMode === 'delta' ? 'Rx err Δ' : 'Rx err',
      sortKey: 'rxErrors',
    },
    {
      label: counterMode === 'delta' ? 'Tx err Δ' : 'Tx err',
      sortKey: 'txErrors',
    },
    {
      label: counterMode === 'delta' ? 'CRC Δ' : 'CRC',
      sortKey: 'rxCrcErrors',
    },
    {
      label: counterMode === 'delta' ? 'Align Δ' : 'Align',
      sortKey: 'rxAlignErrors',
    },
    {
      label: counterMode === 'delta' ? 'Rx Δ' : 'Rx',
      sortKey: 'rxBytes',
    },
    {
      label: counterMode === 'delta' ? 'Tx Δ' : 'Tx',
      sortKey: 'txBytes',
    },
    { label: 'Last link change' },
    { label: 'Sampled' },
  ]

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Interfaces</h1>
            <p className="text-xs text-subtle mt-0.5">
              Status, error, and utilisation counters
              {selectedHostId && (
                <>
                  {' '}· last synced {fmtRelative(lastSyncedAt)}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedHostId}
              onChange={e => handleHostChange(e.target.value)}
              className={[
                'text-xs bg-muted border border-border rounded-lg',
                'px-3 py-2 text-foreground outline-none',
                'focus:border-primary focus:ring-2 focus:ring-primary/10',
                'min-w-[180px]',
              ].join(' ')}
            >
              <option value="">Select APIC host…</option>
              {apicHosts.map(h => (
                <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
              ))}
            </select>

            <button
              onClick={() => setCredentialOpen(true)}
              disabled={!selectedHostId || syncing}
              title="Resync interfaces from APIC"
              className={[
                'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm',
                selectedHostId && !syncing
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-faint cursor-not-allowed',
              ].join(' ')}
            >
              <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
            </button>

            <button
              onClick={handleExport}
              disabled={!selectedHostId || exporting || rows.length === 0}
              title="Export interface samples to CSV"
              className={[
                'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg border transition-colors',
                selectedHostId && !exporting && rows.length > 0
                  ? 'border-border text-foreground hover:bg-muted'
                  : 'border-border text-faint cursor-not-allowed',
              ].join(' ')}
            >
              <IconDownload size={12} stroke={1.75} />
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {!selectedHostId ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="relative mb-6">
              <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center shadow-sm">
                <IconServer size={24} stroke={1.25} className="text-faint" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-border border-2 border-background" />
            </div>
            <h2 className="font-serif text-base font-semibold text-foreground mb-1">
              No APIC host selected
            </h2>
            <p className="text-xs text-subtle mb-6 max-w-[260px] leading-relaxed">
              {apicHosts.length === 0
                ? 'No APIC hosts configured yet. Add one in Settings to get started.'
                : 'Choose a host to view its interface inventory.'}
            </p>
            {apicHosts.length > 0 && (
              <select
                value={selectedHostId}
                onChange={e => handleHostChange(e.target.value)}
                className={[
                  'text-xs bg-muted border border-border rounded-lg',
                  'px-3 py-2 text-foreground outline-none cursor-pointer',
                  'focus:border-primary focus:ring-2 focus:ring-primary/10',
                  'min-w-[220px] transition-colors',
                ].join(' ')}
              >
                <option value="">Select APIC host…</option>
                {apicHosts.map(h => (
                  <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                <div className="relative w-56 shrink-0">
                  <IconSearch
                    size={13}
                    stroke={1.75}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Search node, ifName, description…"
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

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
                        <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground shadow-sm">
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
                      availableNodes.map(n => (
                        <DropdownMenuCheckboxItem
                          key={n || '(blank)'}
                          checked={filterNode.includes(n)}
                          onCheckedChange={() => handleNodeToggle(n)}
                          onSelect={event => event.preventDefault()}
                        >
                          {n || '(blank)'}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
                  {(['delta', 'current'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={counterMode === mode}
                      onClick={() => handleCounterModeChange(mode)}
                      className={[
                        'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                        counterMode === mode
                          ? 'bg-card text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {mode === 'delta' ? 'Delta' : 'Current'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{total}</span>{' '}
                  {total === 1 ? 'interface' : 'interfaces'}
                </span>
              </div>
            </div>

            <div
              className={[
                'bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
                'transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {rows.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  {query || activeFilterCount > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No interfaces match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No interfaces synced yet</p>
                      <p className="text-xs text-faint mt-1">
                        Click <strong>Resync</strong> to pull the latest data from APIC
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className={TABLE_SCROLL_CLS}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {tableHeaders.map(h => (
                          <th
                            key={h.label}
                            aria-sort={
                              h.sortKey && sortKey === h.sortKey
                                ? sortDirection === 'asc' ? 'ascending' : 'descending'
                                : undefined
                            }
                            className={DENSE_TABLE_HEAD_CLS}
                          >
                            {h.sortKey ? (
                              <button
                                type="button"
                                onClick={() => handleSort(h.sortKey!)}
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
                    <tbody>
                      {rows.map((r, i) => {
                        const visibleCounters = selectVisibleCounters(r, counterMode)

                        return (
                          <tr
                            key={r.id}
                            className="group cursor-pointer border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                            style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                            onClick={() =>
                              setSelected({
                                id: r.id,
                                node: r.node,
                                ifName: r.ifName,
                                description: r.description,
                                operSt: r.operSt,
                              })
                            }
                          >
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                              {r.node || '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-foreground">{r.ifName}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{r.description || '—'}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{r.adminSt || '—'}</td>
                            <td className="px-4 py-2.5"><OperStBadge st={r.operSt} /></td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.operSpeed || '—'}</td>
                            <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.rxErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                              {counterMode === 'delta' ? fmtDelta(visibleCounters.rxErrors) : fmtCount(visibleCounters.rxErrors)}
                            </td>
                            <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.txErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                              {counterMode === 'delta' ? fmtDelta(visibleCounters.txErrors) : fmtCount(visibleCounters.txErrors)}
                            </td>
                            <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.rxCrcErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                              {counterMode === 'delta' ? fmtDelta(visibleCounters.rxCrcErrors) : fmtCount(visibleCounters.rxCrcErrors)}
                            </td>
                            <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.rxAlignErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                              {counterMode === 'delta' ? fmtDelta(visibleCounters.rxAlignErrors) : fmtCount(visibleCounters.rxAlignErrors)}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{fmtBytes(visibleCounters.rxBytes)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{fmtBytes(visibleCounters.txBytes)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtDate(r.lastLinkStChg)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtRelative(r.lastSampledAt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} interfaces`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} interfaces`}
                </p>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-faint">Per page</span>
                    <select
                      value={String(pageSize)}
                      onChange={e => handlePageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value) as PageSizeValue)}
                      disabled={isPending}
                      className="text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
                    >
                      {PAGE_SIZE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {pageSize !== 'all' && totalPages > 1 && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePage(page - 1)}
                          disabled={page <= 1 || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconChevronLeft size={12} stroke={1.75} />
                          Prev
                        </button>

                        <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">
                          {page} / {totalPages}
                        </span>

                        <button
                          onClick={() => handlePage(page + 1)}
                          disabled={page >= totalPages || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <IconChevronRight size={12} stroke={1.75} />
                        </button>

                        <div className="w-px h-4 bg-border" />

                        <form onSubmit={handleJump} className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpValue}
                            onChange={e => setJumpValue(e.target.value)}
                            placeholder="Go to…"
                            className="w-20 text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="submit"
                            disabled={!jumpValue || isPending}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
          </>
        )}
      </div>
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync interfaces"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
      <InterfaceErrorTrendDrawer selected={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
