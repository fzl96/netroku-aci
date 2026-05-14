'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconRefresh, IconSearch, IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import type { Endpoint } from '@prisma/client'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'flex items-center gap-1.5 text-[10px] font-medium',
        active ? 'text-[var(--success-text)]' : 'text-[var(--text-faint)]',
      ].join(' ')}
    >
      <span
        className={[
          'w-1.5 h-1.5 rounded-full shrink-0',
          active ? 'bg-[var(--success-dot)]' : 'bg-[var(--border)]',
        ].join(' ')}
      />
      {active ? 'Active' : 'Historical'}
    </span>
  )
}

const SKELETON_WIDTHS = [52, 68, 30, 42, 58, 75, 62, 62, 40]

function TableSkeleton() {
  return (
    <tbody>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--border-lighter)] last:border-0">
          {SKELETON_WIDTHS.map((w, j) => (
            <td key={j} className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(' ')}>
              <div
                className="h-2.5 rounded-sm bg-[var(--surface-alt)] animate-pulse"
                style={{ width: `${w + ((i * 11 + j * 7) % 20) - 10}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

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
  endpoints: Endpoint[]
  selectedHostId: string
  query: string
  page: number
  total: number
  pageSize: PageSizeValue
  activeTotal: number
  historicalTotal: number
}

export function EndpointsClient({
  apicHosts,
  endpoints,
  selectedHostId,
  query,
  page,
  total,
  pageSize,
  activeTotal,
  historicalTotal,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchValue, setSearchValue] = useState(query)
  const [jumpValue, setJumpValue] = useState('')

  // Sync input when query changes via back/forward navigation
  useEffect(() => { setSearchValue(query) }, [query])

  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const loading = isPending || syncing

  function buildUrl(overrides: { apic?: string; query?: string; page?: number; pageSize?: PageSizeValue }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    const qs = params.toString()
    return `/endpoints${qs ? `?${qs}` : ''}`
  }

  function handleHostChange(hostId: string) {
    startTransition(() => {
      router.replace(hostId ? `/endpoints?apic=${hostId}` : '/endpoints')
    })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      startTransition(() => {
        router.replace(buildUrl({ query: value, page: 1 }))
      })
    }, 300)
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
    if (p >= 1 && p <= totalPages) {
      handlePage(p)
    }
    setJumpValue('')
  }

  async function handleResync() {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/endpoints/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId }),
      })
      const data = await res.json() as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} active endpoints (${data.total} total with history)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="min-h-full bg-[var(--bg)]">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-[var(--text)]">Endpoints</h1>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">ACI fabric endpoint inventory</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedHostId}
              onChange={e => handleHostChange(e.target.value)}
              className={[
                'text-xs bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg',
                'px-3 py-2 text-[var(--text)] outline-none',
                'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10',
                'min-w-[180px]',
              ].join(' ')}
            >
              <option value="">Select APIC host…</option>
              {apicHosts.map(h => (
                <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
              ))}
            </select>

            <button
              onClick={handleResync}
              disabled={!selectedHostId || syncing}
              title="Resync endpoints from APIC"
              className={[
                'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm',
                selectedHostId && !syncing
                  ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--surface-alt)] text-[var(--text-faint)] cursor-not-allowed',
              ].join(' ')}
            >
              <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {!selectedHostId ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm text-[var(--text-subtle)]">No APIC host selected</p>
            <p className="text-xs text-[var(--text-faint)] mt-1">
              Select an APIC host from the dropdown above to view endpoints
            </p>
          </div>
        ) : (
          <>
            {/* Search + stats row */}
            <div className="flex items-center justify-between gap-4">
              <div className="relative max-w-xs w-full">
                <IconSearch
                  size={13}
                  stroke={1.75}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] pointer-events-none"
                />
                <input
                  type="text"
                  value={searchValue}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder="Search MAC, IP, VLAN, node…"
                  className={SEARCH_INPUT_CLS}
                />
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-[var(--text-subtle)]">
                <span>
                  <span className="font-semibold text-[var(--success-text)]">
                    {activeTotal}
                  </span>{' '}
                  active
                </span>
                <span className="text-[var(--border)]">·</span>
                <span>
                  <span className="font-semibold text-[var(--text)]">
                    {historicalTotal}
                  </span>{' '}
                  historical
                </span>
              </div>
            </div>

            {/* Table */}
            <div
              className={[
                'bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm',
                'transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {endpoints.length === 0 && !isPending ? (
                <div className="px-4 py-14 text-center">
                  {query ? (
                    <>
                      <p className="text-sm text-[var(--text-subtle)]">No endpoints match &ldquo;{query}&rdquo;</p>
                      <p className="text-xs text-[var(--text-faint)] mt-1">Try a different search term</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-[var(--text-subtle)]">No endpoints found</p>
                      <p className="text-xs text-[var(--text-faint)] mt-1">
                        Click <strong>Resync</strong> to pull the latest data from the APIC
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {['MAC', 'IP', 'VLAN', 'Node', 'Interface', 'EPG Description', 'First Seen', 'Last Seen', 'Status'].map(h => (
                          <th
                            key={h}
                            className="text-left px-4 pt-3 pb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-faint)] whitespace-nowrap border-b border-[var(--border)]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    {isPending ? (
                      <TableSkeleton />
                    ) : (
                      <tbody>
                        {endpoints.map((ep, index) => (
                          <tr
                            key={ep.id}
                            className="group border-b border-[var(--border-lighter)] last:border-0 hover:bg-[var(--surface-alt)] transition-colors duration-100 animate-fade-up"
                            style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                          >
                            <td className="px-4 py-2.5 font-mono text-[var(--text)] border-l-2 border-l-transparent group-hover:border-l-[var(--accent)] transition-colors duration-100">{ep.mac}</td>
                            <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{ep.ip || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-muted)]">{ep.vlan}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-muted)]">{ep.node || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-[var(--text-muted)]">{ep.interface || '—'}</td>
                            <td className="px-4 py-2.5 text-[var(--text-subtle)] max-w-[200px] truncate" title={ep.epgDescr}>{ep.epgDescr || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-faint)] whitespace-nowrap">{fmt(ep.firstSeenAt)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-[var(--text-faint)] whitespace-nowrap">{fmt(ep.lastSeenAt)}</td>
                            <td className="px-4 py-2.5"><Badge active={ep.isActive} /></td>
                          </tr>
                        ))}
                      </tbody>
                    )}
                  </table>
                </div>
              )}
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-[var(--text-subtle)] shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} endpoints`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} endpoints`}
                </p>

                <div className="flex items-center gap-2">
                  {/* Page size selector */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--text-faint)]">Per page</span>
                    <select
                      value={String(pageSize)}
                      onChange={e => handlePageSizeChange(e.target.value === 'all' ? 'all' : Number(e.target.value) as PageSizeValue)}
                      disabled={isPending}
                      className="text-xs bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 disabled:opacity-40"
                    >
                      {PAGE_SIZE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Prev / page indicator / jump / next */}
                  {pageSize !== 'all' && totalPages > 1 && (
                    <>
                      <div className="w-px h-4 bg-[var(--border)]" />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePage(page - 1)}
                          disabled={page <= 1 || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconChevronLeft size={12} stroke={1.75} />
                          Prev
                        </button>

                        <span className="px-2 py-1.5 text-xs text-[var(--text-subtle)] tabular-nums">
                          {page} / {totalPages}
                        </span>

                        <button
                          onClick={() => handlePage(page + 1)}
                          disabled={page >= totalPages || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <IconChevronRight size={12} stroke={1.75} />
                        </button>

                        <div className="w-px h-4 bg-[var(--border)]" />

                        <form onSubmit={handleJump} className="flex items-center gap-1">
                          <input
                            type="number"
                            min={1}
                            max={totalPages}
                            value={jumpValue}
                            onChange={e => setJumpValue(e.target.value)}
                            placeholder="Go to…"
                            className="w-20 text-xs bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-[var(--text)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="submit"
                            disabled={!jumpValue || isPending}
                            className="px-2.5 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--surface-alt)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    </div>
  )
}
