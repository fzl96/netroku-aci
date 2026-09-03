'use client'

import { IconRefresh } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function LegacyDeviceRegionError({ region }: { region: 'summary' | 'filters' | 'results' }) {
  const router = useRouter()
  const [retrying, startTransition] = useTransition()

  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card px-4 py-5"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Could not load legacy device {region}</p>
        <p className="mt-1 text-xs text-subtle">The rest of the page is still available.</p>
      </div>
      <button
        type="button"
        disabled={retrying}
        onClick={() => startTransition(() => router.refresh())}
        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
      >
        <IconRefresh size={13} className={retrying ? 'animate-spin' : ''} />
        {retrying ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  )
}
