'use client'

import type { FormEvent, ReactNode } from 'react'
import { createContext, useContext, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconFilter2,
  IconRefresh,
  IconSearch,
  IconServer,
} from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildEndpointPageUrl,
  countActiveEndpointFilterGroups,
  type EndpointPageParams,
  type EndpointPageSize,
  type EndpointStatusFilter,
  type EndpointView,
} from '@/lib/endpoints/params'
import type {
  EndpointOverviewData,
  EndpointHostOption,
  EndpointResultsData,
  EndpointRow,
} from '@/lib/endpoints/query'
import {
  nextSortState,
  sortEndpointRows,
  sortPortRows,
  type EndpointPortSummary,
  type EndpointSortKey,
  type PortSortKey,
  type SortDirection,
} from '@/lib/endpoints/sort'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import { ExportEndpointsDialog } from './export-endpoints-dialog'
import { PortDetailPanel } from './port-detail-panel'

type UrlOverrides = {
  apic?: string
  view?: EndpointView
  query?: string
  page?: number
  pageSize?: EndpointPageSize
  vlan?: string[]
  node?: string[]
  iface?: string[]
  status?: string[]
}

function endpointUrl(params: EndpointPageParams, overrides: UrlOverrides): string {
  const view = overrides.view ?? params.view
  return buildEndpointPageUrl({
    hostId: overrides.apic ?? params.hostId,
    view,
    query: overrides.query ?? params.query,
    page: overrides.page ?? params.page,
    pageSize: overrides.pageSize ?? params.pageSize,
    vlans: overrides.vlan ?? params.vlans,
    nodes: overrides.node ?? params.nodes,
    interfaces: view === 'endpoint' ? overrides.iface ?? params.interfaces : [],
    statuses: (overrides.status ?? params.statuses).filter(
      (value): value is EndpointStatusFilter => value === 'active' || value === 'historical',
    ),
  })
}

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function Badge({ active }: { active: boolean }) {
  return (
    <span className={`flex items-center gap-1.5 text-[10px] font-medium ${active ? 'text-success' : 'text-faint'}`}>
      <span className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-success-dot' : 'bg-border'}`} />
      {active ? 'Active' : 'Historical'}
    </span>
  )
}

const PAGE_SIZE_OPTIONS: { label: string; value: EndpointPageSize }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

const ENDPOINT_HEADERS: { label: string; key: EndpointSortKey }[] = [
  { label: 'MAC', key: 'mac' },
  { label: 'IP', key: 'ip' },
  { label: 'VLAN', key: 'vlan' },
  { label: 'Node', key: 'node' },
  { label: 'Interface', key: 'interface' },
  { label: 'EPG Description', key: 'epgDescr' },
  { label: 'First Seen', key: 'firstSeenAt' },
  { label: 'Last Seen', key: 'lastSeenAt' },
  { label: 'Status', key: 'status' },
]

const PORT_HEADERS: { label: string; key: PortSortKey }[] = [
  { label: 'Node', key: 'node' },
  { label: 'Interface', key: 'interface' },
  { label: 'Endpoints', key: 'endpointCount' },
  { label: 'VLANs', key: 'vlans' },
  { label: 'EPG Description', key: 'epgDescrs' },
  { label: 'Last Seen', key: 'lastSeenAt' },
]

function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string
  sortKey: K
  sort: { key: K; direction: SortDirection } | null
  onSort: (key: K) => void
}) {
  const active = sort?.key === sortKey
  const direction = active ? sort.direction : undefined
  const ariaSort = direction === undefined ? 'none' : direction === 'asc' ? 'ascending' : 'descending'

  return (
    <th className={DENSE_TABLE_HEAD_CLS} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label} ${direction === 'asc' ? 'descending' : 'ascending'}`}
        className="-my-1 inline-flex items-center gap-1 rounded py-1 text-left hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        {label}
        {active && (direction === 'asc'
          ? <IconChevronUp size={13} stroke={2} />
          : <IconChevronDown size={13} stroke={2} />)}
      </button>
    </th>
  )
}

type EndpointNavigation = {
  isPending: boolean
  navigate: (url: string) => void
  refresh: () => void
}

const EndpointNavigationContext = createContext<EndpointNavigation | null>(null)

function useEndpointNavigation(): EndpointNavigation {
  const navigation = useContext(EndpointNavigationContext)
  if (!navigation) throw new Error('Endpoint navigation requires EndpointsClient')
  return navigation
}

export function EndpointsClient({
  actions,
  children,
}: {
  actions: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigation: EndpointNavigation = {
    isPending,
    navigate: url => startTransition(() => router.replace(url)),
    refresh: () => startTransition(() => router.refresh()),
  }

  return (
    <EndpointNavigationContext.Provider value={navigation}>
      <div className="min-h-full bg-background">
        <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
          <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
            <div>
              <h1 className="font-serif text-[18px] font-semibold text-foreground">Endpoints</h1>
              <p className="mt-0.5 text-xs text-subtle">ACI fabric endpoint inventory</p>
            </div>
            {actions}
          </div>
        </div>
        <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">{children}</main>
      </div>
    </EndpointNavigationContext.Provider>
  )
}

export function EndpointHeaderActionsClient({
  params,
  hosts,
  hostTotal,
  filteredTotal,
}: {
  params: EndpointPageParams
  hosts: EndpointHostOption[]
  hostTotal: number
  filteredTotal: number
}) {
  const { isPending, navigate, refresh } = useEndpointNavigation()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const selectedHost = hosts.find(host => host.id === params.hostId)

  async function handleResync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/endpoints/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = await response.json() as { synced?: number; total?: number; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} active endpoints (${data.total} total with history)`)
      refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <select
        value={params.hostId}
        onChange={event => navigate(event.target.value ? `/endpoints?apic=${event.target.value}` : '/endpoints')}
        disabled={isPending}
        className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none transition-opacity focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[180px] md:flex-none"
      >
        <option value="">Select APIC host…</option>
        {hosts.map(host => (
          <option key={host.id} value={host.id}>{host.name} ({host.host})</option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCredentialOpen(true)}
        disabled={!params.hostId || syncing}
        title="Resync endpoints from APIC"
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors ${params.hostId && !syncing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed bg-muted text-faint'}`}
      >
        <IconRefresh size={12} stroke={1.75} className={syncing || isPending ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>
      <ExportEndpointsDialog
        apicHostId={params.hostId}
        hostTotal={hostTotal}
        filteredTotal={filteredTotal}
        filters={{
          query: params.query,
          vlan: params.vlans,
          node: params.nodes,
          iface: params.interfaces,
          status: params.statuses,
        }}
      />
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync endpoints"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}

export function NoEndpointHost() {

  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="relative mb-6">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <IconServer size={24} stroke={1.25} className="text-faint" />
        </div>
        <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-background bg-border" />
      </div>
      <h2 className="mb-1 font-serif text-base font-semibold text-foreground">No APIC host selected</h2>
      <p className="mb-6 max-w-[260px] text-xs leading-relaxed text-subtle">
        No APIC hosts are configured yet. Add one in Settings to get started.
      </p>
    </div>
  )
}

export function EndpointOverviewClient({
  params,
  overview,
}: {
  params: EndpointPageParams
  overview: EndpointOverviewData
}) {
  const { isPending, navigate: navigateTo } = useEndpointNavigation()
  const [searchValue, setSearchValue] = useState(params.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noun = params.view === 'endpoint' ? 'endpoints' : 'ports'
  const activeFilterGroupCount = countActiveEndpointFilterGroups({
    vlan: params.vlans,
    node: params.nodes,
    iface: params.interfaces,
    status: params.statuses,
  }, params.view)

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  function navigate(overrides: UrlOverrides) {
    navigateTo(endpointUrl(params, overrides))
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => navigate({ query: value, page: 1 }), 300)
  }

  function handleFilterChange(key: 'vlan' | 'node' | 'iface' | 'status', value: string[]) {
    navigate({ [key]: value, page: 1 })
  }

  return (
    <section className={`flex flex-wrap items-center justify-between gap-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-border">
          {([['endpoint', 'By Endpoint'], ['port', 'By Port']] as const).map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => navigate({ view, page: 1 })}
              disabled={isPending}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${params.view === view ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[140px] flex-1 md:w-56 md:flex-none">
          <IconSearch size={13} stroke={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            type="text"
            value={searchValue}
            onChange={event => handleSearchChange(event.target.value)}
            placeholder={params.view === 'endpoint' ? 'Search MAC, IP, VLAN…' : 'Search node, port, MAC, IP…'}
            className={SEARCH_INPUT_CLS}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={`Filter ${noun}`}
              aria-label={`Filter ${noun}`}
              disabled={isPending}
              className={`relative flex size-9 shrink-0 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-40 ${activeFilterGroupCount > 0 ? 'border-primary bg-primary/8 text-foreground' : 'border-border bg-muted text-muted-foreground hover:text-foreground'}`}
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
            <FilterSubmenu label="VLAN" value={params.vlans} options={overview.choices.vlans} onChange={value => handleFilterChange('vlan', value)} disabled={isPending} searchable />
            <FilterSubmenu label="Node" value={params.nodes} options={overview.choices.nodes} onChange={value => handleFilterChange('node', value)} disabled={isPending} />
            {params.view === 'endpoint' && (
              <FilterSubmenu label="Interface" value={params.interfaces} options={overview.choices.interfaces} onChange={value => handleFilterChange('iface', value)} disabled={isPending} searchable />
            )}
            <FilterSubmenu label="Status" value={params.statuses} options={['active', 'historical']} onChange={value => handleFilterChange('status', value)} disabled={isPending} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">
        <span><span className="font-semibold text-success">{overview.activeTotal}</span> active</span>
        <span className="text-border">·</span>
        <span><span className="font-semibold text-foreground">{overview.historicalTotal}</span> historical</span>
      </div>
    </section>
  )
}

export function EndpointResultsClient({
  params,
  results,
}: {
  params: EndpointPageParams
  results: EndpointResultsData
}) {
  const { isPending, navigate: navigateTo } = useEndpointNavigation()
  const [jumpValue, setJumpValue] = useState('')
  const [endpointSort, setEndpointSort] = useState<{ key: EndpointSortKey; direction: SortDirection } | null>(null)
  const [portSort, setPortSort] = useState<{ key: PortSortKey; direction: SortDirection } | null>(null)
  const [selectedPort, setSelectedPort] = useState<EndpointPortSummary<EndpointRow> | null>(null)
  const { page, pageSize, total, totalPages } = results.pagination
  const effectiveParams = { ...params, page }
  const noun = results.view === 'endpoint' ? 'endpoints' : 'ports'
  const rows = results.rows
  const displayedEndpoints = results.view === 'endpoint'
    ? endpointSort ? sortEndpointRows(results.rows, endpointSort.key, endpointSort.direction) : results.rows
    : []
  const displayedPorts = results.view === 'port'
    ? portSort ? sortPortRows(results.rows, portSort.key, portSort.direction) : results.rows
    : []
  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const filtered = Boolean(
    params.query || params.vlans.length || params.nodes.length
    || (params.view === 'endpoint' && params.interfaces.length) || params.statuses.length,
  )

  function navigate(overrides: UrlOverrides) {
    navigateTo(endpointUrl(effectiveParams, overrides))
  }

  function handleJump(event: FormEvent) {
    event.preventDefault()
    const nextPage = Number.parseInt(jumpValue, 10)
    if (nextPage >= 1 && nextPage <= totalPages) navigate({ page: nextPage })
    setJumpValue('')
  }

  return (
    <section className={`space-y-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}>
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        {rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-subtle">{filtered ? `No ${noun} match the current filters` : `No ${noun} found`}</p>
            <p className="mt-1 text-xs text-faint">{filtered ? 'Try adjusting the search or filter values' : 'Click Resync to pull the latest data from the APIC'}</p>
          </div>
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {results.view === 'endpoint'
                    ? ENDPOINT_HEADERS.map(header => (
                      <SortableHeader key={header.key} label={header.label} sortKey={header.key} sort={endpointSort} onSort={key => setEndpointSort(current => nextSortState(current?.key, current?.direction, key))} />
                    ))
                    : PORT_HEADERS.map(header => (
                      <SortableHeader key={header.key} label={header.label} sortKey={header.key} sort={portSort} onSort={key => setPortSort(current => nextSortState(current?.key, current?.direction, key))} />
                    ))}
                </tr>
              </thead>
              <tbody>
                {results.view === 'endpoint'
                  ? displayedEndpoints.map((endpoint, index) => (
                    <tr key={endpoint.id} className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted" style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}>
                      <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">{endpoint.mac}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{endpoint.ip || '—'}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{endpoint.vlan}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{endpoint.node || '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{endpoint.interface || '—'}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-subtle" title={endpoint.epgDescr}>{endpoint.epgDescr || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-faint">{fmt(endpoint.firstSeenAt)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-faint">{fmt(endpoint.lastSeenAt)}</td>
                      <td className="px-4 py-2.5"><Badge active={endpoint.isActive} /></td>
                    </tr>
                  ))
                  : displayedPorts.map((port, index) => (
                    <tr key={port.id} onClick={() => setSelectedPort(port)} className="group animate-fade-up cursor-pointer border-b border-border-faint last:border-0 hover:bg-muted" style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}>
                      <td className="border-l-2 border-l-transparent px-4 py-2.5 font-medium tabular-nums text-foreground group-hover:border-l-primary">{port.node}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{port.interface}</td>
                      <td className="px-4 py-2.5 tabular-nums text-foreground"><span className="font-semibold">{port.endpointCount}</span><span className="ml-1.5 text-[11px] text-subtle">({port.activeCount} active)</span></td>
                      <td className="max-w-[160px] truncate px-4 py-2.5 font-mono text-muted-foreground" title={port.vlans.join(', ')}>{port.vlans.join(', ') || '—'}</td>
                      <td className="max-w-[200px] truncate px-4 py-2.5 text-subtle" title={port.epgDescrs.join(', ')}>{port.epgDescrs.join(', ') || '—'}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-faint">{fmt(port.lastSeenAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="space-y-2 md:hidden">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-4 py-14 text-center">
            <p className="text-sm text-subtle">{filtered ? `No ${noun} match the current filters` : `No ${noun} found`}</p>
            <p className="mt-1 text-xs text-faint">{filtered ? 'Try adjusting the search or filter values' : 'Tap Resync to pull the latest data from the APIC'}</p>
          </div>
        ) : results.view === 'endpoint' ? (
          displayedEndpoints.map(endpoint => (
            <DataCard key={endpoint.id}>
              <DataCardHeader trailing={<Badge active={endpoint.isActive} />}>
                <DataCardTitle className="font-mono">{endpoint.mac}</DataCardTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{endpoint.ip || '—'}</p>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow label="VLAN / Node" value={`${endpoint.vlan} · ${endpoint.node || '—'}`} />
                <DataCardRow label="Interface" value={<span className="font-mono">{endpoint.interface || '—'}</span>} />
                <DataCardRow label="EPG" value={endpoint.epgDescr || '—'} />
                <DataCardRow label="Last seen" value={fmt(endpoint.lastSeenAt)} />
              </DataCardBody>
            </DataCard>
          ))
        ) : (
          displayedPorts.map(port => (
            <DataCard
              key={port.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPort(port)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedPort(port)
              }}
            >
              <DataCardHeader trailing={<span className="text-xs tabular-nums text-foreground"><span className="font-semibold">{port.endpointCount}</span><span className="ml-1 text-[11px] text-subtle">({port.activeCount} active)</span></span>}>
                <DataCardTitle className="font-mono">Node {port.node}</DataCardTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{port.interface}</p>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow label="VLANs" value={port.vlans.join(', ') || '—'} />
                <DataCardRow label="EPG" value={port.epgDescrs.join(', ') || '—'} />
                <DataCardRow label="Last seen" value={fmt(port.lastSeenAt)} />
              </DataCardBody>
            </DataCard>
          ))
        )}
      </div>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <p className="shrink-0 text-xs text-subtle">
            {pageSize === 'all' ? `Showing all ${total} ${noun}` : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}
          </p>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="text-xs text-faint">Per page</span>
              <select
                value={String(pageSize)}
                onChange={event => navigate({ pageSize: event.target.value === 'all' ? 'all' : Number(event.target.value) as EndpointPageSize, page: 1 })}
                disabled={isPending}
                className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
              >
                {PAGE_SIZE_OPTIONS.map(option => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
              </select>
            </div>
            {pageSize !== 'all' && totalPages > 1 && (
              <>
                <div className="hidden h-4 w-px bg-border md:block" />
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => navigate({ page: page - 1 })} disabled={page <= 1 || isPending} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"><IconChevronLeft size={12} />Prev</button>
                  <span className="px-2 py-1.5 text-xs tabular-nums text-subtle">{page} / {totalPages}</span>
                  <button type="button" onClick={() => navigate({ page: page + 1 })} disabled={page >= totalPages || isPending} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40">Next<IconChevronRight size={12} /></button>
                  <div className="hidden h-4 w-px bg-border md:block" />
                  <form onSubmit={handleJump} className="hidden items-center gap-1 md:flex">
                    <input type="number" min={1} max={totalPages} value={jumpValue} onChange={event => setJumpValue(event.target.value)} placeholder="Go to…" className="w-20 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none" />
                    <button type="submit" disabled={!jumpValue || isPending} className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40">Go</button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <PortDetailPanel port={selectedPort} onClose={() => setSelectedPort(null)} />
    </section>
  )
}
