'use client'

import type { ReactNode } from 'react'
import { use, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { IconSearch } from '@tabler/icons-react'
import type { CounterMode } from '@/lib/interface-health/counter-mode'
import {
  buildInterfaceHealthPageUrl,
  type InterfaceHealthPageParams,
  type InterfaceWindow,
} from '@/lib/interface-health/params'
import type { InterfaceView } from '@/lib/interface-health/interface-query'
import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'

function interfaceUrl(
  params: InterfaceHealthPageParams,
  overrides: Partial<InterfaceHealthPageParams>,
): string {
  return buildInterfaceHealthPageUrl({ ...params, ...overrides })
}

export function InterfaceControls({
  paramsPromise,
  nodeFilter,
  summary,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  nodeFilter: ReactNode
  summary: ReactNode
}) {
  const params = use(paramsPromise)
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const navigate = (url: string) => startTransition(() => router.replace(url))

  const [searchValue, setSearchValue] = useState(params.query)
  const [previousQuery, setPreviousQuery] = useState(params.query)
  const [lastDispatchedQuery, setLastDispatchedQuery] = useState(params.query)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync input when query changes via back/forward navigation, but ignore the
  // echo from our own debounced router.replace so in-flight typing isn't clobbered.
  if (params.query !== previousQuery) {
    setPreviousQuery(params.query)
    if (params.query !== lastDispatchedQuery) {
      setSearchValue(params.query)
    }
  }

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    [],
  )

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLastDispatchedQuery(value.trim())
      navigate(interfaceUrl(params, { query: value.trim(), page: 1 }))
    }, 300)
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
        <div className="relative min-w-[140px] flex-1 md:w-56 md:flex-none">
          <IconSearch
            size={13}
            stroke={1.75}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
          />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search node, ifName, description…"
            className={SEARCH_INPUT_CLS}
          />
        </div>

        {nodeFilter}

        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          {(
            [
              { label: 'All', value: 'all' },
              { label: 'Counting CRC', value: 'crc' },
              { label: 'State Changes', value: 'state-changed' },
            ] as const
          ).map((v) => (
            <button
              key={v.value}
              type="button"
              aria-pressed={params.view === v.value}
              onClick={() =>
                navigate(interfaceUrl(params, { view: v.value as InterfaceView, page: 1 }))
              }
              className={[
                'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                params.view === v.value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>

        <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
          {(['delta', 'current'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={params.counterMode === mode}
              onClick={() =>
                navigate(interfaceUrl(params, { counterMode: mode as CounterMode, page: 1 }))
              }
              className={[
                'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                params.counterMode === mode
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {mode === 'delta' ? 'Delta' : 'Current'}
            </button>
          ))}
        </div>

        {(params.view === 'crc' || params.view === 'state-changed') && (
          <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
            {(['7d', '30d'] as const).map((w) => (
              <button
                key={w}
                type="button"
                aria-pressed={params.window === w}
                onClick={() =>
                  navigate(interfaceUrl(params, { window: w as InterfaceWindow, page: 1 }))
                }
                disabled={isPending}
                className={[
                  'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                  params.window === w
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                {w}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 text-xs text-subtle">{summary}</div>
    </div>
  )
}
