'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconRefresh, IconSearch, IconChevronLeft, IconChevronRight, IconServer, IconFilter2,
} from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import {
  countActiveEpgFilterGroups,
  type EpgWithBindings,
} from '@/lib/epgs/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import { EpgDetailPanel } from './EpgDetailPanel'
import { EpgPortDetailPanel } from './EpgPortDetailPanel'
import type { EpgPortSummary } from './sort'

type ViewValue = 'epg' | 'port'
type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

interface Props {
  apicHosts: SafeApicHost[]
  view: ViewValue
  epgs: EpgWithBindings[]
  ports?: EpgPortSummary[]
  selectedHostId: string
  query: string
  filterTenant: string[]
  filterAp: string[]
  filterNode: string[]
  tenants: string[]
  aps: string[]
  nodeOptions: string[]
  page: number
  total: number
  pageSize: PageSizeValue
  lastSyncAt: string | null
}

export function EpgsClient({
  apicHosts, view, epgs, ports = [], selectedHostId, query,
  filterTenant, filterAp, filterNode,
  tenants, aps, nodeOptions,
  page, total, pageSize, lastSyncAt,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDispatchedQuery = useRef(query)
  const [searchValue, setSearchValue] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)
  const [selectedEpgId, setSelectedEpgId] = useState<string | null>(null)
  const [selectedPort, setSelectedPort] = useState<EpgPortSummary | null>(null)

  // Sync input on back/forward navigation.
  if (query !== previousQuery) {
    setPreviousQuery(query)
    setSearchValue(query)
  }

  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const activeFilterGroupCount = countActiveEpgFilterGroups({
    tenant: filterTenant, ap: filterAp, node: filterNode,
  })
  const selectedHost = apicHosts.find(host => host.id === selectedHostId)
  const selectedEpg = epgs.find(e => e.id === selectedEpgId) ?? null
  const noun = view === 'epg' ? 'EPGs' : 'ports'
  const currentItemsCount = view === 'epg' ? epgs.length : ports.length

  function buildUrl(overrides: {
    apic?: string; view?: ViewValue; query?: string; page?: number; pageSize?: PageSizeValue
    tenant?: string[]; ap?: string[]; node?: string[]
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const v = overrides.view ?? view
    const q = overrides.query !== undefined ? overrides.query : query
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize
    const ft = overrides.tenant !== undefined ? overrides.tenant : filterTenant
    const fa = overrides.ap !== undefined ? overrides.ap : filterAp
    const fn = overrides.node !== undefined ? overrides.node : filterNode

    if (apic) params.set('apic', apic)
    if (v !== 'epg') params.set('view', v)
    if (q.trim()) params.set('query', q.trim())
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    if (ft.length > 0) params.set('tenant', ft.join(','))
    if (fa.length > 0) params.set('ap', fa.join(','))
    if (fn.length > 0) params.set('node', fn.join(','))
    const qs = params.toString()
    return `/epgs${qs ? `?${qs}` : ''}`
  }

  function navigate(url: string) {
    startTransition(() => { router.replace(url) })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastDispatchedQuery.current = value.trim()
      navigate(buildUrl({ query: value, page: 1 }))
    }, 300)
  }

  function handleFilterChange(key: 'tenant' | 'ap' | 'node', value: string[]) {
    navigate(buildUrl({ [key]: value, page: 1 }))
  }

  async function handleResync(credentials: { username: string; password: string }) {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/epgs/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = await res.json() as { syncedEpgs?: number; syncedBindings?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedEpgs} EPGs (${data.syncedBindings} port bindings)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  const loading = isPending || syncing

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">EPG</h1>
            <p className="text-xs text-subtle mt-0.5">Deployed EPGs and their static port bindings</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedHostId}
              onChange={e => navigate(e.target.value ? `/epgs?apic=${e.target.value}` : '/epgs')}
              className="text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 min-w-[180px]"
            >
              <option value="">Select APIC host…</option>
              {apicHosts.map(h => (
                <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
              ))}
            </select>

            <button
              onClick={() => setCredentialOpen(true)}
              disabled={!selectedHostId || syncing}
              title="Resync EPGs from APIC"
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
                : 'Choose a host to view its EPG inventory.'}
            </p>
          </div>
        ) : (
          <>
            {/* View toggle + search + filters + stats */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {/* View toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                  {([['epg', 'By EPG'], ['port', 'By Port']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => navigate(buildUrl({ view: v, page: 1 }))}
                      disabled={isPending}
                      className={[
                        'px-3 py-2 text-xs font-semibold transition-colors',
                        view === v
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative w-56 shrink-0">
                  <IconSearch size={13} stroke={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder={view === 'epg' ? 'Search EPG, tenant, BD…' : 'Search node, port, EPG…'}
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                {/* Filter menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={`Filter ${noun}`}
                      aria-label={`Filter ${noun}`}
                      disabled={isPending}
                      className={[
                        'relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none',
                        'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40',
                        activeFilterGroupCount > 0
                          ? 'border-primary bg-primary/8 text-foreground'
                          : 'border-border bg-muted text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <IconFilter2 size={15} stroke={1.75} />
                      {activeFilterGroupCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground shadow-sm">
                          {activeFilterGroupCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44" align="start">
                    <DropdownMenuLabel>Filters</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <FilterSubmenu label="Tenant" value={filterTenant} options={tenants} onChange={v => handleFilterChange('tenant', v)} disabled={isPending} searchable />
                    <FilterSubmenu label="App Profile" value={filterAp} options={aps} onChange={v => handleFilterChange('ap', v)} disabled={isPending} searchable />
                    {view === 'port' && (
                      <FilterSubmenu label="Node" value={filterNode} options={nodeOptions} onChange={v => handleFilterChange('node', v)} disabled={isPending} searchable />
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span title="Last EPG sync">synced {fmt(lastSyncAt)}</span>
              </div>
            </div>

            {/* Table */}
            <div className={[
              'bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
              'transition-opacity duration-150',
              isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
            ].join(' ')}>
              {currentItemsCount === 0 && !isPending ? (
                <div className="px-4 py-14 text-center">
                  {query || activeFilterGroupCount > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No {noun} match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No {noun} found</p>
                      <p className="text-xs text-faint mt-1">
                        Click <strong>Resync</strong> to pull the latest data from the APIC
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className={TABLE_SCROLL_CLS}>
                  {view === 'epg' ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts'].map(h => (
                            <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {epgs.map(epg => (
                          <tr
                            key={epg.id}
                            onClick={() => setSelectedEpgId(epg.id)}
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 cursor-pointer"
                          >
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                              {epg.name}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{epg.tenant}</td>
                            <td className="px-4 py-2.5 font-mono text-subtle text-[11px]">{epg.appProfile}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{epg.bridgeDomain || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {epg.bindings.length > 0
                                ? <span className="font-medium text-foreground">{epg.bindings.length}</span>
                                : <span className="text-faint">0</span>}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {epg.providedContracts.length + epg.consumedContracts.length > 0
                                ? <span className="font-medium text-foreground">{epg.providedContracts.length + epg.consumedContracts.length}</span>
                                : <span className="text-faint">0</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['Node', 'Port', 'Type', 'EPGs', 'Tenants', 'Encaps / VLANs', 'Mode'].map(h => (
                            <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ports.map(port => (
                          <tr
                            key={port.id}
                            onClick={() => setSelectedPort(port)}
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 cursor-pointer"
                          >
                            <td className="px-4 py-2.5 tabular-nums font-medium text-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                              {port.node}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[180px] truncate" title={port.port}>{port.port}</td>
                            <td className="px-4 py-2.5 text-subtle uppercase text-[10px]">{port.pathType}</td>
                            <td className="px-4 py-2.5 tabular-nums">
                              <span className="font-semibold text-foreground">{port.epgCount}</span>
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground max-w-[160px] truncate" title={port.tenants.join(', ')}>{port.tenants.join(', ') || '—'}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[180px] truncate" title={port.encaps.join(', ')}>{port.encaps.join(', ') || '—'}</td>
                            <td className="px-4 py-2.5 text-subtle max-w-[120px] truncate" title={port.modes.join(', ')}>{port.modes.join(', ') || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} ${noun}`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-faint">Per page</span>
                    <select
                      value={String(pageSize)}
                      onChange={e => navigate(buildUrl({ pageSize: e.target.value === 'all' ? 'all' : Number(e.target.value) as PageSizeValue, page: 1 }))}
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
                          onClick={() => navigate(buildUrl({ page: page - 1 }))}
                          disabled={page <= 1 || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconChevronLeft size={12} stroke={1.75} />
                          Prev
                        </button>
                        <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">{page} / {totalPages}</span>
                        <button
                          onClick={() => navigate(buildUrl({ page: page + 1 }))}
                          disabled={page >= totalPages || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <IconChevronRight size={12} stroke={1.75} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedEpg && (
        <EpgDetailPanel epg={selectedEpg} onClose={() => setSelectedEpgId(null)} />
      )}

      {selectedPort && (
        <EpgPortDetailPanel port={selectedPort} onClose={() => setSelectedPort(null)} />
      )}

      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync EPGs"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}

