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
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconLoader,
} from '@tabler/icons-react'
import { useApicHosts } from '@/components/ApicHostsProvider'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
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
import type { TrendPoint } from './FaultsTrendChart'

const FaultsTrendChart = dynamic(() => import('./FaultsTrendChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm h-[232px] animate-pulse" />
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FaultRowProps {
  id: string
  code: string
  severity: string
  domain: string
  type: string
  affectedDn: string
  node: string | null
  descr: string
  ack: boolean
  created: string | null
}

type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

const SEVERITIES = ['critical', 'major', 'minor', 'warning'] as const
type Severity = (typeof SEVERITIES)[number]

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  warning: 'Warning',
}

interface Props {
  selectedApic: string | null
  query: string
  severity: string | null
  nodeFilter: string[]
  availableNodes: string[]
  rows: FaultRowProps[]
  total: number
  page: number
  pageSize: PageSizeValue
  lastSyncedAt: string | null
  trend: TrendPoint[]
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

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    critical: 'bg-red-500/12 text-red-600 dark:text-red-400',
    major: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
    minor: 'bg-amber-500/12 text-amber-600 dark:text-amber-500',
    warning: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
  }
  const cls = styles[severity] ?? 'bg-muted text-muted-foreground'
  const label = (SEVERITY_LABEL as Record<string, string>)[severity] ?? severity ?? '—'
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize',
        cls,
      ].join(' ')}
    >
      {label}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

function TableSkeleton({ columns = 7 }: { columns?: number }) {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-border-faint last:border-0">
          {Array.from({ length: columns }).map((_, j) => (
            <td key={j} className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(' ')}>
              <div
                className="h-2.5 rounded-sm bg-muted animate-pulse"
                style={{ width: `${35 + ((i * 13 + j * 17) % 45)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

export function FaultsClient({
  selectedApic,
  query,
  severity,
  nodeFilter,
  availableNodes,
  rows,
  total,
  page,
  pageSize,
  lastSyncedAt,
  trend,
}: Props) {
  const apicHosts = useApicHosts()
  const router = useRouter()
  const selectedHostId = selectedApic ?? ''
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
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
    severity?: string | null
    node?: string[]
    page?: number
    pageSize?: PageSizeValue
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const sev = overrides.severity !== undefined ? overrides.severity : severity
    const n = overrides.node !== undefined ? overrides.node : nodeFilter
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (sev) params.set('severity', sev)
    if (n.length > 0) params.set('node', n.join(','))
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    const qs = params.toString()
    return `/faults${qs ? `?${qs}` : ''}`
  }

  function handleHostChange(hostId: string) {
    startTransition(() => {
      router.replace(hostId ? `/faults?apic=${hostId}` : '/faults')
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

  function handleSeverityChange(value: string) {
    const next = value === 'all' ? null : value
    startTransition(() => {
      router.replace(buildUrl({ severity: next, page: 1 }))
    })
  }

  function handleNodeToggle(value: string) {
    const next = nodeFilter.includes(value)
      ? nodeFilter.filter(v => v !== value)
      : [...nodeFilter, value]
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
      const res = await fetch('/api/faults/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = (await res.json()) as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} faults (${data.total} total)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  const activeFilterCount = nodeFilter.length > 0 ? 1 : 0
  const loading = isPending || syncing

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-4 md:px-8 py-3 md:py-0 md:h-16 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Faults</h1>
            <p className="text-xs text-subtle mt-0.5">
              Active fabric faults by severity
              {selectedHostId && (
                <>
                  {' '}· last synced {fmtRelative(lastSyncedAt)}
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <select
              value={selectedHostId}
              onChange={e => handleHostChange(e.target.value)}
              disabled={isPending}
              className={[
                'text-xs bg-muted border border-border rounded-lg',
                'px-3 py-2 text-foreground outline-none',
                'focus:border-primary focus:ring-2 focus:ring-primary/10',
                'flex-1 md:flex-none md:min-w-[180px]',
                'disabled:opacity-60 disabled:cursor-not-allowed transition-opacity',
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
              title="Resync faults from APIC"
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
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 md:py-6 space-y-4">
        {!selectedHostId && !isPending ? (
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
                : 'Choose a host to view its active faults.'}
            </p>
            {apicHosts.length > 0 && (
              <select
                value={selectedHostId}
                onChange={e => handleHostChange(e.target.value)}
                disabled={isPending}
                className={[
                  'text-xs bg-muted border border-border rounded-lg',
                  'px-3 py-2 text-foreground outline-none cursor-pointer',
                  'focus:border-primary focus:ring-2 focus:ring-primary/10',
                  'min-w-[220px] transition-colors',
                  'disabled:opacity-60 disabled:cursor-not-allowed transition-opacity',
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
            {trend.length > 0 && <FaultsTrendChart trend={trend} />}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 w-full md:w-auto">
                <div className="relative flex-1 md:w-56 md:flex-none">
                  <IconSearch
                    size={13}
                    stroke={1.75}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none"
                  />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Search code, description, dn…"
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                <select
                  value={severity ?? 'all'}
                  onChange={e => handleSeverityChange(e.target.value)}
                  disabled={isPending}
                  className={[
                    'text-xs bg-muted border border-border rounded-lg',
                    'px-2.5 py-2 text-foreground outline-none cursor-pointer',
                    'focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40',
                  ].join(' ')}
                >
                  <option value="all">All severities</option>
                  {SEVERITIES.map(s => (
                    <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>
                  ))}
                </select>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="Filter faults"
                      aria-label="Filter faults"
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
                          checked={nodeFilter.includes(n)}
                          onCheckedChange={() => handleNodeToggle(n)}
                          onSelect={event => event.preventDefault()}
                        >
                          {n || '(blank)'}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{total}</span>{' '}
                  {total === 1 ? 'fault' : 'faults'}
                </span>
              </div>
            </div>

            <div
              className={[
                'hidden md:block bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
                'transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {rows.length === 0 ? (
                <div className="px-4 py-14 text-center">
                  {query || severity || activeFilterCount > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No faults match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No active faults</p>
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
                        {[
                          'Severity', 'Code', 'Affected', 'Domain', 'Description', 'Created', 'Ack',
                        ].map(h => (
                          <th
                            key={h}
                            className={DENSE_TABLE_HEAD_CLS}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {isPending ? (
                      <TableSkeleton columns={7} />
                    ) : (
                      <tbody>
                        {rows.map((r, i) => (
                        <tr
                          key={r.id}
                          className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                          style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        >
                          <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                            <SeverityBadge severity={r.severity} />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-foreground whitespace-nowrap">{r.code}</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[260px] truncate" title={r.node || r.affectedDn}>
                            {r.node || r.affectedDn || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.domain || '—'}</td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[420px] truncate" title={r.descr}>
                            {r.descr || '—'}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtDate(r.created)}</td>
                          <td className="px-4 py-2.5">
                            {r.ack ? (
                              <IconCheck size={14} stroke={2} className="text-success" />
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Mobile card list */}
            <div
              className={[
                'space-y-2 md:hidden transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {rows.length === 0 ? (
                <div className="rounded-2xl border border-border bg-card px-4 py-14 text-center">
                  {query || severity || activeFilterCount > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No faults match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No active faults</p>
                      <p className="text-xs text-faint mt-1">
                        Tap <strong>Resync</strong> to pull the latest data from APIC
                      </p>
                    </>
                  )}
                </div>
              ) : (
                rows.map(r => (
                  <DataCard key={r.id}>
                    <DataCardHeader trailing={<SeverityBadge severity={r.severity} />}>
                      <DataCardTitle className="font-mono">{r.code}</DataCardTitle>
                      {r.descr && (
                        <p className="mt-1 text-xs leading-snug text-muted-foreground line-clamp-2">
                          {r.descr}
                        </p>
                      )}
                    </DataCardHeader>
                    <DataCardBody>
                      <DataCardRow
                        label="Affected"
                        value={<span className="font-mono">{r.node || r.affectedDn || '—'}</span>}
                      />
                      <DataCardRow label="Domain" value={r.domain || '—'} />
                      <DataCardRow label="Created" value={fmtRelative(r.created)} />
                      <DataCardRow label="Ack" value={r.ack ? 'Yes' : 'No'} />
                    </DataCardBody>
                  </DataCard>
                ))
              )}
            </div>

            {total > 0 && (
              <div className="flex flex-wrap items-center justify-between pt-1 gap-3">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} faults`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} faults`}
                </p>

                <div className="flex items-center gap-2">
                  <div className="hidden md:flex items-center gap-1.5">
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
                      <div className="hidden md:block w-px h-4 bg-border" />
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

                        <div className="hidden md:block w-px h-4 bg-border" />

                        <form onSubmit={handleJump} className="hidden md:flex items-center gap-1">
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
        title="Resync faults"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
