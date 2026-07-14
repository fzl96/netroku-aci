'use client'

import { useRef, useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconRefresh,
  IconSearch,
  IconServer,
  IconChevronLeft,
  IconChevronRight,
  IconLoader,
} from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { TrendPoint } from './HealthTrendChart'

const HealthTrendChart = dynamic(() => import('./HealthTrendChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm h-[232px] animate-pulse" />
  ),
})

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthRowProps {
  id: string
  scope: string
  name: string
  node: string | null
  score: number
  maxSeverity: string | null
  lastSeenAt: string
}

type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

const SCOPES = ['node', 'tenant'] as const
type Scope = (typeof SCOPES)[number]

const SCOPE_LABEL: Record<Scope, string> = {
  node: 'Node',
  tenant: 'Tenant',
}

interface Props {
  apicHosts: SafeApicHost[]
  selectedApic: string | null
  query: string
  scope: string | null
  rows: HealthRowProps[]
  total: number
  page: number
  pageSize: PageSizeValue
  lastSyncedAt: string | null
  fabricScore: number | null
  pods: { name: string; score: number }[]
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

type Band = { label: string; text: string; bg: string }

function band(score: number | null): Band {
  if (score === null) {
    return { label: '—', text: 'text-muted-foreground', bg: 'bg-muted' }
  }
  if (score >= 95) {
    return { label: 'good', text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/12' }
  }
  if (score >= 80) {
    return { label: 'fair', text: 'text-amber-600 dark:text-amber-500', bg: 'bg-amber-500/12' }
  }
  return { label: 'poor', text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/12' }
}

function ScoreBadge({ score }: { score: number }) {
  const b = band(score)
  return (
    <span
      className={[
        'inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
        b.bg,
        b.text,
      ].join(' ')}
    >
      {score}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HealthScoresClient({
  apicHosts,
  selectedApic,
  query,
  scope,
  rows,
  total,
  page,
  pageSize,
  lastSyncedAt,
  fabricScore,
  pods,
  trend,
}: Props) {
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
    scope?: string | null
    page?: number
    pageSize?: PageSizeValue
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const sc = overrides.scope !== undefined ? overrides.scope : scope
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (sc) params.set('scope', sc)
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    const qs = params.toString()
    return `/health-scores${qs ? `?${qs}` : ''}`
  }

  function handleHostChange(hostId: string) {
    startTransition(() => {
      router.replace(hostId ? `/health-scores?apic=${hostId}` : '/health-scores')
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

  function handleScopeChange(value: string) {
    const next = value === 'all' ? null : value
    startTransition(() => {
      router.replace(buildUrl({ scope: next, page: 1 }))
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
      const res = await fetch('/api/health-scores/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = (await res.json()) as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} health scores (${data.total} total)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  const fabricBand = band(fabricScore)
  const loading = isPending || syncing

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Health Scores</h1>
            <p className="text-xs text-subtle mt-0.5">
              Fabric, node, and tenant health
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
              disabled={isPending}
              className={[
                'text-xs bg-muted border border-border rounded-lg',
                'px-3 py-2 text-foreground outline-none',
                'focus:border-primary focus:ring-2 focus:ring-primary/10',
                'min-w-[180px]',
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
              title="Resync health scores from APIC"
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

      <div className="px-8 py-6 space-y-4">
        {isPending ? (
          <div className="flex flex-col items-center justify-center py-28 text-center animate-fade-up">
            <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center shadow-sm mb-4">
              <IconLoader size={24} className="animate-spin text-primary" />
            </div>
            <h2 className="font-serif text-base font-semibold text-foreground mb-1">
              Loading APIC host data…
            </h2>
            <p className="text-xs text-subtle">
              Fetching fabric and node health scores from the selected host
            </p>
          </div>
        ) : !selectedHostId ? (
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
                : 'Choose a host to view its health scores.'}
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
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-end gap-4">
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint mb-1">
                    Overall fabric health
                  </p>
                  <span className={['font-serif text-4xl font-semibold tabular-nums', fabricBand.text].join(' ')}>
                    {fabricScore === null ? '—' : fabricScore}
                  </span>
                </div>
              </div>
              {pods.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {pods.map(pod => {
                    const b = band(pod.score)
                    return (
                      <div
                        key={pod.name}
                        className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5"
                      >
                        <span className="text-xs text-muted-foreground">{pod.name}</span>
                        <span className={['text-sm font-semibold tabular-nums', b.text].join(' ')}>
                          {pod.score}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {trend.length > 0 && <HealthTrendChart trend={trend} />}

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
                    placeholder="Search name, node, dn…"
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                <select
                  value={scope ?? 'all'}
                  onChange={e => handleScopeChange(e.target.value)}
                  disabled={isPending}
                  className={[
                    'text-xs bg-muted border border-border rounded-lg',
                    'px-2.5 py-2 text-foreground outline-none cursor-pointer',
                    'focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40',
                  ].join(' ')}
                >
                  <option value="all">All scopes</option>
                  {SCOPES.map(s => (
                    <option key={s} value={s}>{SCOPE_LABEL[s]}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{total}</span>{' '}
                  {total === 1 ? 'object' : 'objects'}
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
                  {query || scope ? (
                    <>
                      <p className="text-sm text-subtle">No objects match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No health scores</p>
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
                          'Scope', 'Name', 'Node', 'Score', 'Max severity', 'Last seen',
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
                    <tbody>
                      {rows.map((r, i) => (
                        <tr
                          key={r.id}
                          className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                          style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                        >
                          <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100 capitalize text-muted-foreground">
                            {r.scope}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-foreground max-w-[260px] truncate" title={r.name}>
                            {r.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                            {r.node || '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <ScoreBadge score={r.score} />
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.maxSeverity || '—'}</td>
                          <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtDate(r.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} objects`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} objects`}
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
        title="Resync health scores"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
