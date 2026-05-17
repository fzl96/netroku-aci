'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconRefresh,
  IconSearch,
  IconServer,
  IconFilter2,
  IconDownload,
} from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InterfaceRowProps {
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
  // BigInts serialised as decimal strings — see page.tsx
  dRxBytes: string | null
  dRxErrors: string | null
  dRxDiscards: string | null
  dRxCrcErrors: string | null
  dRxAlignErrors: string | null
  dTxBytes: string | null
  dTxErrors: string | null
  dTxDiscards: string | null
}

interface Props {
  apicHosts: SafeApicHost[]
  rows: InterfaceRowProps[]
  selectedHostId: string
  query: string
  filterUsage: string[]
  availableUsages: string[]
  lastSyncedAt: string | null
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

function UsageLabel({ usage }: { usage: string }) {
  const text = usage || '—'
  return (
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {text}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InterfaceHealthClient({
  apicHosts,
  rows,
  selectedHostId,
  query,
  filterUsage,
  availableUsages,
  lastSyncedAt,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [searchValue, setSearchValue] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)

  if (query !== previousQuery) {
    setPreviousQuery(query)
    setSearchValue(query)
  }

  function buildUrl(overrides: { apic?: string; query?: string; usage?: string[] }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const u = overrides.usage !== undefined ? overrides.usage : filterUsage

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    // Encode usage filter; omit the param when it matches the default ["epg"] to keep URLs clean.
    if (!(u.length === 1 && u[0] === 'epg')) {
      if (u.length > 0) params.set('usage', u.join(','))
      else params.set('usage', '')
    }
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
      startTransition(() => {
        router.replace(buildUrl({ query: value }))
      })
    }, 300)
  }

  function handleUsageToggle(value: string) {
    const next = filterUsage.includes(value)
      ? filterUsage.filter(v => v !== value)
      : [...filterUsage, value]
    startTransition(() => {
      router.replace(buildUrl({ usage: next }))
    })
  }

  async function handleResync() {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/interfaces/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId }),
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
          usage: filterUsage.length > 0 ? filterUsage : undefined,
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

  const activeFilterCount = !(filterUsage.length === 1 && filterUsage[0] === 'epg') ? 1 : 0
  const loading = isPending || syncing

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Interface Health</h1>
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
              onClick={handleResync}
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
                : 'Choose a host to view its interface health.'}
            </p>
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
                    <DropdownMenuLabel>Usage</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {availableUsages.length === 0 ? (
                      <DropdownMenuItem disabled>No values available</DropdownMenuItem>
                    ) : (
                      availableUsages.map(u => (
                        <DropdownMenuCheckboxItem
                          key={u || '(blank)'}
                          checked={filterUsage.includes(u)}
                          onCheckedChange={() => handleUsageToggle(u)}
                          onSelect={event => event.preventDefault()}
                        >
                          {u || '(blank)'}
                        </DropdownMenuCheckboxItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-foreground">{rows.length}</span>{' '}
                  {rows.length === 1 ? 'interface' : 'interfaces'}
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
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        {[
                          'Node', 'Interface', 'Usage', 'Admin', 'Oper', 'Speed',
                          'Rx err Δ', 'Tx err Δ', 'CRC Δ', 'Align Δ',
                          'Rx Δ', 'Tx Δ',
                          'Last link change', 'Sampled',
                        ].map(h => (
                          <th
                            key={h}
                            className="text-left px-4 pt-3 pb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint whitespace-nowrap border-b border-border"
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
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                            {r.node || '—'}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-foreground">{r.ifName}</td>
                          <td className="px-4 py-2.5"><UsageLabel usage={r.usage} /></td>
                          <td className="px-4 py-2.5 text-muted-foreground">{r.adminSt || '—'}</td>
                          <td className="px-4 py-2.5"><OperStBadge st={r.operSt} /></td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.operSpeed || '—'}</td>
                          <td className={['px-4 py-2.5 tabular-nums', isNonZero(r.dRxErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                            {fmtCount(r.dRxErrors)}
                          </td>
                          <td className={['px-4 py-2.5 tabular-nums', isNonZero(r.dTxErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                            {fmtCount(r.dTxErrors)}
                          </td>
                          <td className={['px-4 py-2.5 tabular-nums', isNonZero(r.dRxCrcErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                            {fmtCount(r.dRxCrcErrors)}
                          </td>
                          <td className={['px-4 py-2.5 tabular-nums', isNonZero(r.dRxAlignErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                            {fmtCount(r.dRxAlignErrors)}
                          </td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{fmtBytes(r.dRxBytes)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{fmtBytes(r.dTxBytes)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtDate(r.lastLinkStChg)}</td>
                          <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmtRelative(r.lastSampledAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
