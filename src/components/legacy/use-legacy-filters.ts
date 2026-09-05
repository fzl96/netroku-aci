'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

const SEARCH_DEBOUNCE_MS = 300

/** Immediate, URL-driven list controls: every change navigates on its own, so
 *  the legacy pages need no Apply button.
 *
 *  Overrides merge onto the last state this hook dispatched rather than onto
 *  the props, so toggling two filters faster than the server can answer keeps
 *  both. Page always resets, because a narrowed result set rarely still has
 *  the page the reader was on. */
export function useLegacyFilters<T extends { query: string; page: number }>({
  params,
  buildUrl,
}: {
  params: T
  buildUrl: (params: T) => string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [search, setSearch] = useState(params.query)
  const [previousQuery, setPreviousQuery] = useState(params.query)
  const [dispatchedQuery, setDispatchedQuery] = useState(params.query)
  const stateRef = useRef(params)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isPending) stateRef.current = params
  }, [isPending, params])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  // Back/forward navigation should refill the field, but the echo of our own
  // debounced replace must not clobber whatever has been typed since.
  if (params.query !== previousQuery) {
    setPreviousQuery(params.query)
    if (params.query !== dispatchedQuery) setSearch(params.query)
  }

  function apply(overrides: Partial<T>) {
    const next = { ...stateRef.current, ...overrides, page: 1 } as T
    stateRef.current = next
    startTransition(() => router.replace(buildUrl(next), { scroll: false }))
  }

  function dispatchSearch(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = value.trim()
    setDispatchedQuery(trimmed)
    apply({ query: trimmed } as Partial<T>)
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => dispatchSearch(value), SEARCH_DEBOUNCE_MS)
  }

  return { search, isPending, apply, handleSearchChange, submitSearch: dispatchSearch }
}

export function toggleFilterValue(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value]
}

export function countActiveFilterGroups(...groups: string[][]): number {
  return groups.filter((group) => group.length > 0).length
}
