import { Suspense } from 'react'
import type { HistoryPageParams } from '@/lib/history/params'
import { HistoryControls } from './history-controls'
import { HistoryResults } from './history-results'
import {
  HistoryControlsSkeleton,
  HistoryResultsSkeleton,
} from './history-skeleton'

export function HistoryView({
  paramsPromise,
}: {
  paramsPromise: Promise<HistoryPageParams>
}) {
  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">
              History
            </h1>
            <p className="mt-0.5 text-xs text-subtle">
              Activity log of actions across Netroku ACI
            </p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <Suspense fallback={<HistoryControlsSkeleton />}>
          <HistoryControls paramsPromise={paramsPromise} />
        </Suspense>
        <Suspense fallback={<HistoryResultsSkeleton />}>
          <HistoryResults paramsPromise={paramsPromise} />
        </Suspense>
      </main>
    </div>
  )
}
