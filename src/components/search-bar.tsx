'use client'

import { useEffect, useRef } from 'react'
import { IconSearch } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useDebouncedCallback } from 'use-debounce'

import { SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import { cn } from '@/lib/utils'

export const SEARCH_DEBOUNCE_MS = 500

export function SearchBar({
  text = 'Search…',
  className,
  paramKey = 'query',
  delay = SEARCH_DEBOUNCE_MS,
}: {
  text?: string
  className?: string
  paramKey?: string
  delay?: number
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const inputRef = useRef<HTMLInputElement>(null)

  const urlQuery = searchParams.get(paramKey) ?? ''

  const handleSearch = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(searchParams)
    const trimmed = value.trim()

    if (trimmed) {
      params.set(paramKey, trimmed)
    } else {
      params.delete(paramKey)
    }

    params.delete('page')

    const queryString = params.toString()

    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false })
  }, delay)

  useEffect(() => {
    if (!inputRef.current) return

    // Only update the DOM value when it actually differs.
    if (inputRef.current.value !== urlQuery) {
      inputRef.current.value = urlQuery
    }
  }, [urlQuery])

  return (
    <div className={cn('relative w-full', className)}>
      <IconSearch
        size={13}
        stroke={1.75}
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
      />

      <input
        ref={inputRef}
        type="search"
        defaultValue={urlQuery}
        onChange={(event) => {
          handleSearch(event.target.value)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            handleSearch.flush()
          }
        }}
        placeholder={text}
        aria-label={text}
        className={SEARCH_INPUT_CLS}
      />
    </div>
  )
}
