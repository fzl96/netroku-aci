'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconRefresh, IconSearch, IconChevronLeft, IconChevronRight, IconChevronDown, IconX, IconServer } from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import type { Endpoint } from '@prisma/client'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'

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
        active ? 'text-success' : 'text-faint',
      ].join(' ')}
    >
      <span
        className={[
          'w-1.5 h-1.5 rounded-full shrink-0',
          active ? 'bg-success-dot' : 'bg-border',
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
        <tr key={i} className="border-b border-border-faint last:border-0">
          {SKELETON_WIDTHS.map((w, j) => (
            <td key={j} className={['px-4 py-2.5', j === 0 ? 'border-l-2 border-l-transparent' : ''].join(' ')}>
              <div
                className="h-2.5 rounded-sm bg-muted animate-pulse"
                style={{ width: `${w + ((i * 11 + j * 7) % 20) - 10}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  )
}

// ─── Filter combobox ──────────────────────────────────────────────────────────

function FilterCombobox({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const displayLabel = value.length === 0
    ? label
    : value.length === 1
      ? value[0]
      : `${label} (${value.length})`

  const active = value.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled || options.length === 0}
          className={[
            'flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-2 border transition-colors outline-none shrink-0',
            'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-40 disabled:cursor-not-allowed',
            active
              ? 'border-primary bg-primary/8 text-foreground'
              : 'border-border bg-muted text-muted-foreground',
          ].join(' ')}
        >
          <span className="max-w-[100px] truncate">{displayLabel}</span>
          {active ? (
            <span
              className="flex items-center"
              onClick={e => { e.stopPropagation(); onChange([]) }}
            >
              <IconX size={11} stroke={2} className="text-faint hover:text-foreground" />
            </span>
          ) : (
            <IconChevronDown size={11} stroke={2} className="text-faint" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup>
              {options.map(opt => (
                <CommandItem
                  key={opt}
                  value={opt}
                  data-checked={String(value.includes(opt))}
                  onSelect={() => toggle(opt)}
                >
                  {opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
  filterVlan: string[]
  filterNode: string[]
  filterIface: string[]
  filterStatus: string[]
  vlans: string[]
  nodes: string[]
  ifaces: string[]
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
  filterVlan,
  filterNode,
  filterIface,
  filterStatus,
  vlans,
  nodes,
  ifaces,
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

  function buildUrl(overrides: { apic?: string; query?: string; page?: number; pageSize?: PageSizeValue; vlan?: string[]; node?: string[]; iface?: string[]; status?: string[] }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const q = overrides.query !== undefined ? overrides.query : query
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize
    const fv = overrides.vlan !== undefined ? overrides.vlan : filterVlan
    const fn = overrides.node !== undefined ? overrides.node : filterNode
    const fi = overrides.iface !== undefined ? overrides.iface : filterIface
    const fs = overrides.status !== undefined ? overrides.status : filterStatus

    if (apic) params.set('apic', apic)
    if (q.trim()) params.set('query', q.trim())
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    if (fv.length > 0) params.set('vlan', fv.join(','))
    if (fn.length > 0) params.set('node', fn.join(','))
    if (fi.length > 0) params.set('iface', fi.join(','))
    if (fs.length > 0 && fs.length < 2) params.set('status', fs[0])
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

  function handleFilterChange(key: 'vlan' | 'node' | 'iface' | 'status', value: string[]) {
    startTransition(() => {
      router.replace(buildUrl({ [key]: value, page: 1 }))
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
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Endpoints</h1>
            <p className="text-xs text-subtle mt-0.5">ACI fabric endpoint inventory</p>
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
              title="Resync endpoints from APIC"
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
                : 'Choose a host to view its endpoint inventory.'}
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
            {/* Search + filters + stats row */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {/* Search */}
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
                    placeholder="Search MAC, IP, VLAN…"
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                {/* Filter comboboxes */}
                <FilterCombobox label="VLAN" value={filterVlan} options={vlans} onChange={v => handleFilterChange('vlan', v)} disabled={isPending} />
                <FilterCombobox label="Node" value={filterNode} options={nodes} onChange={v => handleFilterChange('node', v)} disabled={isPending} />
                <FilterCombobox label="Interface" value={filterIface} options={ifaces} onChange={v => handleFilterChange('iface', v)} disabled={isPending} />
                <FilterCombobox label="Status" value={filterStatus} options={['active', 'historical']} onChange={v => handleFilterChange('status', v)} disabled={isPending} />
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span>
                  <span className="font-semibold text-success">
                    {activeTotal}
                  </span>{' '}
                  active
                </span>
                <span className="text-border">·</span>
                <span>
                  <span className="font-semibold text-foreground">
                    {historicalTotal}
                  </span>{' '}
                  historical
                </span>
              </div>
            </div>

            {/* Table */}
            <div
              className={[
                'bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
                'transition-opacity duration-150',
                isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
              ].join(' ')}
            >
              {endpoints.length === 0 && !isPending ? (
                <div className="px-4 py-14 text-center">
                  {query || filterVlan.length > 0 || filterNode.length > 0 || filterIface.length > 0 || filterStatus.length > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No endpoints match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No endpoints found</p>
                      <p className="text-xs text-faint mt-1">
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
                            className="text-left px-4 pt-3 pb-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint whitespace-nowrap border-b border-border"
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
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                            style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                          >
                            <td className="px-4 py-2.5 font-mono text-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">{ep.mac}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{ep.ip || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{ep.vlan}</td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{ep.node || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{ep.interface || '—'}</td>
                            <td className="px-4 py-2.5 text-subtle max-w-[200px] truncate" title={ep.epgDescr}>{ep.epgDescr || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmt(ep.firstSeenAt)}</td>
                            <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmt(ep.lastSeenAt)}</td>
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
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} endpoints`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} endpoints`}
                </p>

                <div className="flex items-center gap-2">
                  {/* Page size selector */}
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

                  {/* Prev / page indicator / jump / next */}
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
    </div>
  )
}
