'use client'

import type { FormEvent } from 'react'
import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
} from '@tabler/icons-react'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import {
  buildEndpointPageUrl,
  type EndpointPageParams,
  type EndpointPageSize,
} from '@/lib/endpoints/params'
import type {
  EndpointLoadState,
  EndpointResultsData,
  EndpointResultsPayload,
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
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { EndpointRegionError } from './endpoint-region-error'
import { PortDetailPanel } from './port-detail-panel'

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

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={`flex items-center gap-1.5 text-[10px] font-medium ${active ? 'text-success' : 'text-faint'}`}
    >
      <span
        className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-success-dot' : 'bg-border'}`}
      />
      {active ? 'Active' : 'Historical'}
    </span>
  )
}

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
  const ariaSort =
    direction === undefined ? 'none' : direction === 'asc' ? 'ascending' : 'descending'

  return (
    <th className={DENSE_TABLE_HEAD_CLS} aria-sort={ariaSort}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label} ${direction === 'asc' ? 'descending' : 'ascending'}`}
        className="-my-1 inline-flex items-center gap-1 rounded py-1 text-left hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:outline-none"
      >
        {label}
        {active &&
          (direction === 'asc' ? (
            <IconChevronUp size={13} stroke={2} />
          ) : (
            <IconChevronDown size={13} stroke={2} />
          ))}
      </button>
    </th>
  )
}

function EndpointResultsContent({
  params,
  results,
}: {
  params: EndpointPageParams
  results: EndpointResultsData
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [jumpValue, setJumpValue] = useState('')
  const [endpointSort, setEndpointSort] = useState<{
    key: EndpointSortKey
    direction: SortDirection
  } | null>(null)
  const [portSort, setPortSort] = useState<{ key: PortSortKey; direction: SortDirection } | null>(
    null,
  )
  const [selectedPort, setSelectedPort] = useState<EndpointPortSummary<EndpointRow> | null>(null)
  const { page, pageSize, total, totalPages } = results.pagination
  const effectiveParams = { ...params, page }
  const noun = results.view === 'endpoint' ? 'endpoints' : 'ports'
  const rows = results.rows
  const displayedEndpoints =
    results.view === 'endpoint'
      ? endpointSort
        ? sortEndpointRows(results.rows, endpointSort.key, endpointSort.direction)
        : results.rows
      : []
  const displayedPorts =
    results.view === 'port'
      ? portSort
        ? sortPortRows(results.rows, portSort.key, portSort.direction)
        : results.rows
      : []
  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const filtered = Boolean(
    params.query ||
    params.vlans.length ||
    params.nodes.length ||
    (params.view === 'endpoint' && params.interfaces.length) ||
    params.statuses.length,
  )

  function navigate(overrides: { page?: number; pageSize?: EndpointPageSize }) {
    const url = buildEndpointPageUrl({
      ...effectiveParams,
      page: overrides.page ?? effectiveParams.page,
      pageSize: overrides.pageSize ?? effectiveParams.pageSize,
    })
    startTransition(() => router.replace(url, { scroll: false }))
  }

  function handleJump(event: FormEvent) {
    event.preventDefault()
    const nextPage = Number.parseInt(jumpValue, 10)
    if (nextPage >= 1 && nextPage <= totalPages) navigate({ page: nextPage })
    setJumpValue('')
  }

  return (
    <section
      className={`space-y-3 transition-opacity ${isPending ? 'pointer-events-none opacity-60' : ''}`}
    >
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-card shadow-sm md:block">
        {rows.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-subtle">
              {filtered ? `No ${noun} match the current filters` : `No ${noun} found`}
            </p>
            <p className="mt-1 text-xs text-faint">
              {filtered
                ? 'Try adjusting the search or filter values'
                : 'Click Resync to pull the latest data from the APIC'}
            </p>
          </div>
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {results.view === 'endpoint'
                    ? ENDPOINT_HEADERS.map((header) => (
                        <SortableHeader
                          key={header.key}
                          label={header.label}
                          sortKey={header.key}
                          sort={endpointSort}
                          onSort={(key) =>
                            setEndpointSort((current) =>
                              nextSortState(current?.key, current?.direction, key),
                            )
                          }
                        />
                      ))
                    : PORT_HEADERS.map((header) => (
                        <SortableHeader
                          key={header.key}
                          label={header.label}
                          sortKey={header.key}
                          sort={portSort}
                          onSort={(key) =>
                            setPortSort((current) =>
                              nextSortState(current?.key, current?.direction, key),
                            )
                          }
                        />
                      ))}
                </tr>
              </thead>
              <tbody>
                {results.view === 'endpoint'
                  ? displayedEndpoints.map((endpoint, index) => (
                      <tr
                        key={endpoint.id}
                        className="group animate-fade-up border-b border-border-faint last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono text-foreground group-hover:border-l-primary">
                          {endpoint.mac}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {endpoint.ip || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {endpoint.vlan}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                          {endpoint.node || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {endpoint.interface || '—'}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-2.5 text-subtle"
                          title={endpoint.epgDescr}
                        >
                          {endpoint.epgDescr || '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                          {fmt(endpoint.firstSeenAt)}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                          {fmt(endpoint.lastSeenAt)}
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge active={endpoint.isActive} />
                        </td>
                      </tr>
                    ))
                  : displayedPorts.map((port, index) => (
                      <tr
                        key={port.id}
                        onClick={() => setSelectedPort(port)}
                        className="group animate-fade-up cursor-pointer border-b border-border-faint last:border-0 hover:bg-muted"
                        style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                      >
                        <td className="border-l-2 border-l-transparent px-4 py-2.5 font-medium text-foreground tabular-nums group-hover:border-l-primary">
                          {port.node}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">
                          {port.interface}
                        </td>
                        <td className="px-4 py-2.5 text-foreground tabular-nums">
                          <span className="font-semibold">{port.endpointCount}</span>
                          <span className="ml-1.5 text-[11px] text-subtle">
                            ({port.activeCount} active)
                          </span>
                        </td>
                        <td
                          className="max-w-[160px] truncate px-4 py-2.5 font-mono text-muted-foreground"
                          title={port.vlans.join(', ')}
                        >
                          {port.vlans.join(', ') || '—'}
                        </td>
                        <td
                          className="max-w-[200px] truncate px-4 py-2.5 text-subtle"
                          title={port.epgDescrs.join(', ')}
                        >
                          {port.epgDescrs.join(', ') || '—'}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                          {fmt(port.lastSeenAt)}
                        </td>
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
            <p className="text-sm text-subtle">
              {filtered ? `No ${noun} match the current filters` : `No ${noun} found`}
            </p>
            <p className="mt-1 text-xs text-faint">
              {filtered
                ? 'Try adjusting the search or filter values'
                : 'Tap Resync to pull the latest data from the APIC'}
            </p>
          </div>
        ) : results.view === 'endpoint' ? (
          displayedEndpoints.map((endpoint) => (
            <DataCard key={endpoint.id}>
              <DataCardHeader trailing={<Badge active={endpoint.isActive} />}>
                <DataCardTitle className="font-mono">{endpoint.mac}</DataCardTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {endpoint.ip || '—'}
                </p>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow
                  label="VLAN / Node"
                  value={`${endpoint.vlan} · ${endpoint.node || '—'}`}
                />
                <DataCardRow
                  label="Interface"
                  value={<span className="font-mono">{endpoint.interface || '—'}</span>}
                />
                <DataCardRow label="EPG" value={endpoint.epgDescr || '—'} />
                <DataCardRow label="Last seen" value={fmt(endpoint.lastSeenAt)} />
              </DataCardBody>
            </DataCard>
          ))
        ) : (
          displayedPorts.map((port) => (
            <DataCard
              key={port.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedPort(port)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setSelectedPort(port)
              }}
            >
              <DataCardHeader
                trailing={
                  <span className="text-xs text-foreground tabular-nums">
                    <span className="font-semibold">{port.endpointCount}</span>
                    <span className="ml-1 text-[11px] text-subtle">
                      ({port.activeCount} active)
                    </span>
                  </span>
                }
              >
                <DataCardTitle className="font-mono">Node {port.node}</DataCardTitle>
                <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                  {port.interface}
                </p>
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
            {pageSize === 'all'
              ? `Showing all ${total} ${noun}`
              : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}
          </p>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 md:flex">
              <span className="text-xs text-faint">Per page</span>
              <select
                value={String(pageSize)}
                onChange={(event) =>
                  navigate({
                    pageSize:
                      event.target.value === 'all'
                        ? 'all'
                        : (Number(event.target.value) as EndpointPageSize),
                    page: 1,
                  })
                }
                disabled={isPending}
                className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {pageSize !== 'all' && totalPages > 1 && (
              <>
                <div className="hidden h-4 w-px bg-border md:block" />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => navigate({ page: page - 1 })}
                    disabled={page <= 1 || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    <IconChevronLeft size={12} />
                    Prev
                  </button>
                  <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate({ page: page + 1 })}
                    disabled={page >= totalPages || isPending}
                    className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
                  >
                    Next
                    <IconChevronRight size={12} />
                  </button>
                  <div className="hidden h-4 w-px bg-border md:block" />
                  <form onSubmit={handleJump} className="hidden items-center gap-1 md:flex">
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={jumpValue}
                      onChange={(event) => setJumpValue(event.target.value)}
                      placeholder="Go to…"
                      className="w-20 rounded-lg border border-border bg-muted px-2 py-1.5 text-xs text-foreground outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!jumpValue || isPending}
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
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

      <PortDetailPanel port={selectedPort} onClose={() => setSelectedPort(null)} />
    </section>
  )
}

export function EndpointResults({
  dataPromise,
}: {
  dataPromise: Promise<EndpointLoadState<EndpointResultsPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EndpointRegionError region="results" />
  if (state.kind === 'inactive') return null

  return <EndpointResultsContent params={state.data.params} results={state.data.results} />
}
