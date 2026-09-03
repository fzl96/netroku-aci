'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import { SearchBar } from '@/components/search-bar'

export function EpgToolbarClient() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const view = searchParams.get('view') === 'port' ? 'port' : 'epg'

  function selectView(nextView: 'epg' | 'port') {
    const next = new URLSearchParams(searchParams.toString())
    if (nextView === 'epg') {
      next.delete('view')
      next.delete('node')
    } else {
      next.set('view', nextView)
    }
    next.delete('page')
    const query = next.toString()
    startTransition(() => router.replace(query ? `/epgs?${query}` : '/epgs', { scroll: false }))
  }

  return (
    <section className="flex flex-wrap items-center gap-2">
      <div className="flex overflow-hidden rounded-lg border border-border">
        {(
          [
            ['epg', 'By EPG'],
            ['port', 'By Port'],
          ] as const
        ).map(([nextView, label]) => (
          <button
            type="button"
            key={nextView}
            onClick={() => selectView(nextView)}
            disabled={isPending}
            className={`px-3 py-2 text-xs font-semibold ${view === nextView ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <SearchBar
        text={view === 'epg' ? 'Search EPG, tenant, BD…' : 'Search node, port, EPG…'}
        className="min-w-[140px] flex-1 md:w-56 md:flex-none"
      />
    </section>
  )
}
