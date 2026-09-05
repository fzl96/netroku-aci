'use client'

import type { MouseEvent } from 'react'
import { use, useTransition } from 'react'
import { IconChevronDown, IconChevronUp, IconPlugConnected } from '@tabler/icons-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/legacy-empty-state'
import { LegacyPagination } from '@/components/legacy/legacy-pagination'
import { normalizeLegacyInterfaceState } from '@/lib/legacy/interfaces/filters'
import { buildLegacyInterfaceDetailUrl } from '@/lib/legacy/interfaces/detail-params'
import {
  buildLegacyInterfaceUrl,
  mergeLegacyInterfaceListState,
  nextLegacyInterfaceSort,
  type LegacyInterfaceListState,
  type LegacyInterfaceSortKey,
} from '@/lib/legacy/interfaces/params'
import type {
  LegacyInterfaceLoadState,
  LegacyInterfaceResults as LegacyInterfaceResultsData,
  LegacyInterfaceResultsPayload,
  LegacyInterfaceRow,
} from '@/lib/legacy/interfaces/query'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'
import { cn } from '@/lib/utils'
import { LegacyInterfaceRegionError } from './interface-region-error'

function operState(value: string) {
  const state = normalizeLegacyInterfaceState(value)

  if (state === 'down') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
        down
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
      <span className="size-1.5 shrink-0 rounded-full bg-success-dot" />
      up
    </span>
  )
}

function exactCounter(value: string | null): string {
  if (value === null) return '—'
  try {
    return BigInt(value).toLocaleString()
  } catch {
    return value
  }
}

function visibleCrc(row: LegacyInterfaceRow, state: LegacyInterfaceListState): string | null {
  if (state.view === 'crc') return row.crcWindowTotal
  return state.mode === 'delta' ? (row.sample?.dCrcErrors ?? null) : (row.sample?.crcErrors ?? null)
}

function emptyCopy(state: LegacyInterfaceListState) {
  if (state.query || state.deviceIds.length) {
    return {
      title: 'No interfaces match the current filters',
      description: 'Try adjusting the search or selected devices.',
    }
  }
  const windowLabel = state.window === '30d' ? '30 days' : '7 days'
  if (state.view === 'crc') {
    return {
      title: `No increasing CRC errors in the last ${windowLabel}`,
      description: 'All present interfaces report zero CRC error increases in this window.',
    }
  }
  if (state.view === 'state-changed') {
    return {
      title: `No state changes in the last ${windowLabel}`,
      description: 'No present interface changed its Admin or Oper state in this window.',
    }
  }
  return {
    title: 'No legacy interfaces found',
    description: 'Run legacy_sync.py monitor or all to collect interfaces.',
  }
}

function LegacyInterfaceResultsContent({
  state,
  results,
}: {
  state: LegacyInterfaceListState
  results: LegacyInterfaceResultsData
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { rows, total, page, pageSize } = results

  // Every row links to its interface, and the detail page carries this list
  // back so returning does not drop the reader's filters.
  const detailUrl = (id: string) =>
    buildLegacyInterfaceDetailUrl(id, {
      backUrl: buildLegacyInterfaceUrl(mergeLegacyInterfaceListState(state, { page })),
    })

  function openInterface(event: MouseEvent, id: string) {
    // The name cell is a real link so it can be tabbed to and opened in a new
    // tab; when that is what was clicked, let it navigate on its own terms.
    if ((event.target as HTMLElement).closest('a')) return
    // Deliberately outside startTransition: the pending flag dims the table,
    // which is right for a sort and wrong on the way out.
    router.push(detailUrl(id))
  }

  function handleSort(key: LegacyInterfaceSortKey) {
    const next = nextLegacyInterfaceSort(state.sortKey, state.sortDirection, key)
    const url = buildLegacyInterfaceUrl(
      mergeLegacyInterfaceListState(state, {
        sortKey: next.key,
        sortDirection: next.direction,
      }),
    )
    startTransition(() => router.replace(url))
  }

  const counterPrefix = state.mode === 'delta' ? 'Δ ' : ''
  const tableHeaders: Array<{ label: string; key: LegacyInterfaceSortKey }> = [
    { label: 'Device', key: 'hostname' },
    { label: 'Interface', key: 'ifName' },
    { label: 'Description', key: 'description' },
    { label: 'IP address', key: 'ipAddress' },
    { label: 'Admin', key: 'adminSt' },
    { label: 'Operational', key: 'operSt' },
    {
      label: state.view === 'crc' ? `CRC (${state.window})` : `${counterPrefix}CRC`,
      key: 'crcErrors',
    },
    { label: 'Collected', key: 'collectedAt' },
  ]

  if (rows.length === 0 && !isPending) {
    const copy = emptyCopy(state)
    return (
      <LegacyEmptyState
        icon={<IconPlugConnected size={24} />}
        title={copy.title}
        description={copy.description}
      />
    )
  }

  return (
    <>
      <div
        className={[
          '@container w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-opacity duration-150',
          isPending ? 'pointer-events-none opacity-60' : 'opacity-100',
        ].join(' ')}
      >
        <div className="hidden max-h-[calc(100vh-17rem)] overflow-x-hidden overflow-y-auto @[64rem]:block">
          <table className="w-full table-fixed text-xs">
            <colgroup>
              <col className="w-[17%]" />
              <col className="w-[19%]" />
              <col className="w-[15%]" />
              <col className="w-[13%]" />
              <col className="w-[7%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead>
              <tr>
                {tableHeaders.map((header) => (
                  <th
                    key={header.key}
                    aria-sort={
                      state.sortKey === header.key
                        ? state.sortDirection === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    className={cn(DENSE_TABLE_HEAD_CLS, 'px-3')}
                  >
                    <button
                      type="button"
                      onClick={() => handleSort(header.key)}
                      className="inline-flex max-w-full items-center gap-1 text-inherit transition-colors hover:text-foreground"
                    >
                      <span className="truncate">{header.label}</span>
                      {state.sortKey === header.key ? (
                        state.sortDirection === 'asc' ? (
                          <IconChevronUp size={11} stroke={2} className="shrink-0" />
                        ) : (
                          <IconChevronDown size={11} stroke={2} className="shrink-0" />
                        )
                      ) : (
                        <span className="w-[11px] shrink-0" aria-hidden="true" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const crc = exactCounter(visibleCrc(row, state))
                return (
                  <tr
                    key={row.id}
                    onClick={(event) => openInterface(event, row.id)}
                    className="cursor-pointer border-b border-border/70 hover:bg-muted/60"
                  >
                    <td className="px-3 py-3 font-semibold text-foreground">
                      <div className="truncate" title={row.hostname}>
                        {row.hostname}
                      </div>
                      <div className="truncate text-[10px] font-normal text-faint" title={row.site}>
                        {row.site}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono whitespace-nowrap text-foreground">
                      <Link
                        href={detailUrl(row.id)}
                        prefetch={false}
                        title={row.ifName}
                        className="block truncate rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none"
                      >
                        {row.ifName}
                      </Link>
                    </td>
                    <td
                      title={row.description || undefined}
                      className="truncate px-3 py-3 text-subtle"
                    >
                      {row.description || '—'}
                    </td>
                    <td
                      title={
                        row.ipAddress
                          ? `${row.ipAddress}${row.prefixLength === null ? '' : `/${row.prefixLength}`}`
                          : undefined
                      }
                      className="truncate px-3 py-3 font-mono text-subtle"
                    >
                      {row.ipAddress
                        ? `${row.ipAddress}${row.prefixLength === null ? '' : `/${row.prefixLength}`}`
                        : '—'}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {normalizeLegacyInterfaceState(row.adminSt)}
                    </td>
                    <td className="px-3 py-3">{operState(row.operSt)}</td>
                    <td title={crc} className="truncate px-3 py-3 text-right font-mono text-subtle">
                      {crc}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-subtle">
                      {row.sample ? (
                        <time
                          dateTime={row.sample.collectedAt}
                          title={new Date(row.sample.collectedAt).toLocaleString()}
                          className="block"
                        >
                          <span className="block truncate">
                            {new Date(row.sample.collectedAt).toLocaleDateString()}
                          </span>
                          <span className="block truncate text-[10px] text-faint">
                            {new Date(row.sample.collectedAt).toLocaleTimeString()}
                          </span>
                        </time>
                      ) : (
                        <span className="block truncate">No samples</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 p-3 @[64rem]:hidden">
          {rows.map((row) => {
            const crc = exactCounter(visibleCrc(row, state))
            return (
              <Link key={row.id} href={detailUrl(row.id)} prefetch={false} className="block">
                <DataCard>
                  <DataCardHeader trailing={operState(row.operSt)}>
                    <DataCardTitle>
                      {row.hostname} · {row.ifName}
                    </DataCardTitle>
                  </DataCardHeader>
                  <DataCardBody>
                    <DataCardRow label="Site" value={row.site} />
                    <DataCardRow label="Description" value={row.description || 'Not reported'} />
                    <DataCardRow
                      label={state.view === 'crc' ? `CRC (${state.window})` : `${counterPrefix}CRC`}
                      value={crc}
                    />
                  </DataCardBody>
                </DataCard>
              </Link>
            )
          })}
        </div>
        <LegacyPagination page={page} pageSize={pageSize} total={total} />
      </div>
    </>
  )
}

export function LegacyInterfaceResults({
  dataPromise,
}: {
  dataPromise: Promise<LegacyInterfaceLoadState<LegacyInterfaceResultsPayload>>
}) {
  const loadState = use(dataPromise)
  if (loadState.kind === 'unauthorized') return <LegacyInterfaceRegionError region="results" />

  const { state, results } = loadState.data
  return <LegacyInterfaceResultsContent state={state} results={results} />
}
