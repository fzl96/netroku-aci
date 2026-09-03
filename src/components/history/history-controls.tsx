import type { HistoryPageParams } from '@/lib/history/params'
import { HistoryControlsClient } from './history-controls-client'

export async function HistoryControls({
  paramsPromise,
}: {
  paramsPromise: Promise<HistoryPageParams>
}) {
  const params = await paramsPromise
  return <HistoryControlsClient query={params.query} action={params.action} />
}
