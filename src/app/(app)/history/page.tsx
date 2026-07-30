import { Suspense } from 'react'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { parseHistoryPageParams } from '@/lib/history/query'
import { HistoryControls } from './HistoryControls'
import { HistoryResults } from './HistoryResults'
import { HistoryResultsSkeleton } from './HistoryResultsSkeleton'

export const metadata: Metadata = {
  title: 'History',
  description: 'Activity log of actions taken across Netroku ACI.',
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    query?: string
    action?: string
    page?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const params = parseHistoryPageParams(await searchParams)
  const suspenseKey = `${params.query}:${params.action}:${params.page}`

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex h-16 items-center justify-between gap-4 px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">
              History
            </h1>
            <p className="mt-0.5 text-xs text-subtle">
              Activity log of actions across Netroku ACI
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-8 py-6">
        <HistoryControls query={params.query} action={params.action} />
        <Suspense
          key={suspenseKey}
          fallback={<HistoryResultsSkeleton />}
        >
          <HistoryResults params={params} />
        </Suspense>
      </div>
    </div>
  )
}
