'use client'

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { LEGACY_PAGE_SIZES, type LegacyPageSize } from '@/lib/legacy-ui/query'

export function LegacyPagination({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: LegacyPageSize
  total: number
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pages = Math.max(1, Math.ceil(total / pageSize))

  function navigate(nextPage: number, nextPageSize = pageSize) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(Math.min(Math.max(nextPage, 1), Math.max(1, Math.ceil(total / nextPageSize)))))
    params.set('pageSize', String(nextPageSize))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
      <span>{total === 0 ? 'No records' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}</span>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="sr-only">Rows per page</span>
          <select
            value={pageSize}
            onChange={event => navigate(1, Number(event.target.value) as LegacyPageSize)}
            className="rounded-md border border-border bg-muted px-2 py-1.5 text-foreground outline-none focus:ring-2 focus:ring-primary/15"
          >
            {LEGACY_PAGE_SIZES.map(size => <option key={size} value={size}>{size} rows</option>)}
          </select>
        </label>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => navigate(page - 1)}
          className="rounded-md border border-border p-1.5 text-foreground disabled:opacity-35"
        >
          <IconChevronLeft size={14} />
        </button>
        <span className="min-w-16 text-center">{Math.min(page, pages)} / {pages}</span>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pages}
          onClick={() => navigate(page + 1)}
          className="rounded-md border border-border p-1.5 text-foreground disabled:opacity-35"
        >
          <IconChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}
