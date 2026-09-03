'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { EpgPageParams, EpgPageSize, EpgView } from '@/lib/epgs/params'
import type { EpgPagination } from '@/lib/epgs/query'
import { buildEpgUrl } from './epg-url'

const PAGE_SIZES: EpgPageSize[] = [10, 50, 100, 1000, 'all']

export function EpgPaginationClient({
  params,
  pagination,
  view,
}: {
  params: EpgPageParams
  pagination: EpgPagination
  view: EpgView
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { page, pageSize, total, totalPages } = pagination
  const noun = view === 'epg' ? 'EPGs' : 'ports'
  const size = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const start = total ? (page - 1) * size + 1 : 0
  const end = pageSize === 'all' ? total : Math.min(page * size, total)

  function go(overrides: Parameters<typeof buildEpgUrl>[1]) {
    startTransition(() =>
      router.replace(buildEpgUrl({ ...params, page }, overrides), { scroll: false }),
    )
  }

  if (total === 0) return null

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
