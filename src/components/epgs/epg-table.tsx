'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { EpgPageParams, EpgPageSize } from '@/lib/epgs/params'
import type { EpgResultsData } from '@/lib/epgs/query'
import type { EpgPortSummary } from '@/lib/epgs/sort'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { buildEpgUrl } from './epg-url'

const PAGE_SIZES: EpgPageSize[] = [10, 50, 100, 1000, 'all']

export function EpgTable({
  params,
  results,
  onEpgSelect,
  onPortSelect,
}: {
  params: EpgPageParams
  results: EpgResultsData
  onEpgSelect: (id: string) => void
  onPortSelect: (port: EpgPortSummary) => void
}) {
  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className={TABLE_SCROLL_CLS}>
          {results.view === 'epg' ? (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts'].map(
                    (label) => (
                      <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, index) => (
                  <tr
                    key={row.id}
                    onClick={() => onEpgSelect(row.id)}
                    className="animate-fade-up cursor-pointer border-b border-border-faint hover:bg-muted"
                    style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                  >
                    <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono font-medium">
                      {row.name}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{row.tenant}</td>
                    <td className="px-4 py-2.5 font-mono text-subtle">{row.appProfile}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {row.bridgeDomain || '—'}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{row.bindings.length}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {row.providedContracts.length + row.consumedContracts.length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Node', 'Port', 'Type', 'EPGs', 'Tenants', 'Encaps / VLANs', 'Mode'].map(
                    (label) => (
                      <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                        {label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {results.rows.map((row, index) => (
                  <tr
                    key={row.id}
                    onClick={() => onPortSelect(row)}
                    className="animate-fade-up cursor-pointer border-b border-border-faint hover:bg-muted"
                    style={{ animationDelay: `${Math.min(index * 20, 200)}ms` }}
                  >
                    <td className="px-4 py-2.5 font-medium">{row.node}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{row.port}</td>
                    <td className="px-4 py-2.5 text-subtle">{row.pathType}</td>
                    <td className="px-4 py-2.5 font-semibold">{row.epgCount}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {row.tenants.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">
                      {row.encaps.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-subtle">{row.modes.join(', ') || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <EpgPagination params={params} results={results} />
    </>
  )
}

function EpgPagination({ params, results }: { params: EpgPageParams; results: EpgResultsData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { page, pageSize, total, totalPages } = results.pagination
  const noun = results.view === 'epg' ? 'EPGs' : 'ports'
  const size = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const start = total ? (page - 1) * size + 1 : 0
  const end = pageSize === 'all' ? total : Math.min(page * size, total)

  function go(overrides: Parameters<typeof buildEpgUrl>[1]) {
    startTransition(() =>
      router.replace(buildEpgUrl({ ...params, page }, overrides), { scroll: false }),
    )
  }

  return (
    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
      <p className="text-xs text-subtle">
        {pageSize === 'all'
          ? `Showing all ${total} ${noun}`
          : `Showing ${start}–${end} of ${total} ${noun}`}
      </p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-faint">Per page</span>
        <select
          value={String(pageSize)}
          onChange={(event) =>
            go({
              pageSize:
                event.target.value === 'all' ? 'all' : (Number(event.target.value) as EpgPageSize),
              page: 1,
            })
          }
          disabled={isPending}
          className="rounded-lg border border-border bg-muted px-2 py-1.5 text-xs"
        >
          {PAGE_SIZES.map((value) => (
            <option key={String(value)} value={String(value)}>
              {value === 'all' ? 'All' : value}
            </option>
          ))}
        </select>
        {pageSize !== 'all' && totalPages > 1 && (
          <>
            <button
              type="button"
              onClick={() => go({ page: page - 1 })}
              disabled={page <= 1 || isPending}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              <IconChevronLeft size={12} />
              Prev
            </button>
            <span className="text-xs text-subtle">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => go({ page: page + 1 })}
              disabled={page >= totalPages || isPending}
              className="rounded-lg border border-border px-2.5 py-1.5 text-xs disabled:opacity-40"
            >
              Next
              <IconChevronRight size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
