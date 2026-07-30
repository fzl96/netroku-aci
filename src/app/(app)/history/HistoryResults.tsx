import { getAuditLogPage } from '@/actions/audit'
import type { HistoryPageParams } from '@/lib/history/query'
import { HistoryResultsClient } from './HistoryResultsClient'

export async function HistoryResults({
  params,
}: {
  params: HistoryPageParams
}) {
  const result = await getAuditLogPage(params)

  return (
    <HistoryResultsClient
      {...result}
      query={params.query}
      action={params.action}
    />
  )
}
