import type { HistoryPageParams } from '@/lib/history/params'
import { getHistoryPage, HistoryReadError } from '@/lib/history/query'
import { HistoryRegionError } from './history-region-error'
import { HistoryResultsClient } from './history-results-client'

export async function HistoryResults({
  paramsPromise,
}: {
  paramsPromise: Promise<HistoryPageParams>
}) {
  const params = await paramsPromise
  let result: Awaited<ReturnType<typeof getHistoryPage>>

  try {
    result = await getHistoryPage(params)
  } catch (error) {
    if (!(error instanceof HistoryReadError)) throw error
    console.error('[history] failed to load results', error)
    return <HistoryRegionError />
  }

  return (
    <HistoryResultsClient
      key={`${params.query}:${params.action}:${result.page}`}
      {...result}
      query={params.query}
      action={params.action}
    />
  )
}
