'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/** Visible escape hatch for exact search destinations, including records removed since search. */
export function SearchSelection({ found, param = 'selected' }: { found: boolean; param?: string }) {
  const params = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  if (!params.has(param)) return null
  return (
    <div
      role="status"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs"
    >
      <span>
        {found
          ? param === 'mac'
            ? `Showing placements for ${params.get(param)}.`
            : 'Showing the selected search result.'
          : 'This search result is no longer available.'}
      </span>
      <button
        type="button"
        className="ml-auto rounded underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => {
          const next = new URLSearchParams(params.toString())
          next.delete(param)
          next.delete('page')
          router.replace(`${pathname}?${next}`)
        }}
      >
        Show all
      </button>
    </div>
  )
}
