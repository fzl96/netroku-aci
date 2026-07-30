'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import {
  buildHistoryUrl,
  HISTORY_ACTION_LABELS,
  type HistoryActionFilter,
} from '@/lib/history/query'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'

const HISTORY_SELECT_CLS =
  'w-44 cursor-pointer bg-muted border border-border rounded-lg pl-3 pr-8 py-1.5 ' +
  'text-xs text-foreground outline-none ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors'

export function HistoryControls({
  query,
  action,
}: {
  query: string
  action: HistoryActionFilter
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastDispatchedQuery, setLastDispatchedQuery] = useState(query)
  const [searchValue, setSearchValue] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)

  if (query !== previousQuery) {
    setPreviousQuery(query)
    if (query !== lastDispatchedQuery) {
      setSearchValue(query)
    }
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  function navigate(nextQuery: string, nextAction: HistoryActionFilter) {
    setLastDispatchedQuery(nextQuery.trim())
    startTransition(() => {
      router.replace(buildHistoryUrl({
        query: nextQuery,
        action: nextAction,
        page: 1,
      }))
    })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      navigate(value, action)
    }, 300)
  }

  function handleActionChange(nextAction: HistoryActionFilter) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    navigate(searchValue, nextAction)
  }

  return (
    <div
      className="flex items-center gap-3"
      aria-busy={isPending}
    >
      <div className="relative w-full max-w-xs">
        <IconSearch
          size={14}
          stroke={1.75}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          value={searchValue}
          onChange={event => handleSearchChange(event.target.value)}
          placeholder="Search user, target, detail…"
          className={SEARCH_INPUT_CLS}
        />
      </div>
      <select
        value={action}
        onChange={event => handleActionChange(event.target.value as HistoryActionFilter)}
        className={HISTORY_SELECT_CLS}
      >
        <option value="all">All actions</option>
        {Object.entries(HISTORY_ACTION_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  )
}
