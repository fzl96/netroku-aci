import { Suspense } from 'react'
import type { HistoryPageParams } from '@/lib/history/params'
import {
  getHistoryPage,
  HistoryReadError,
  type HistoryLoadState,
  type HistoryResultsPayload,
} from '@/lib/history/query'
import { HistoryControls } from './history-controls'
import { HistoryResults } from './history-results'
import { HistoryControlsSkeleton, HistoryResultsSkeleton } from './history-skeleton'

async function loadResults(
  paramsPromise: Promise<HistoryPageParams>,
): Promise<HistoryLoadState<HistoryResultsPayload>> {
  const params = await paramsPromise

  try {
    const results = await getHistoryPage(params)
    return { kind: 'ready', data: { params, results } }
  } catch (error) {
    if (!(error instanceof HistoryReadError)) throw error
    console.error('[history] failed to load results', error)
    return { kind: 'unauthorized' }
  }
}

export function HistoryShell({ paramsPromise }: { paramsPromise: Promise<HistoryPageParams> }) {
  const resultsPromise = loadResults(paramsPromise)

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center justify-between gap-4 px-4 md:px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">History</h1>
            <p className="mt-0.5 text-xs text-subtle">Activity log of actions across Netroku ACI</p>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <Suspense fallback={<HistoryControlsSkeleton />}>
          <HistoryControls paramsPromise={paramsPromise} />
        </Suspense>
        <Suspense fallback={<HistoryResultsSkeleton />}>
          <HistoryResults dataPromise={resultsPromise} />
        </Suspense>
      </main>
    </div>
  )
}
