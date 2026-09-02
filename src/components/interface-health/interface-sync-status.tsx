import type { InterfaceHostResolution, InterfaceOverviewData } from '@/lib/interface-health/query'
import { InterfaceReadError } from '@/lib/interface-health/query'
import { InterfaceSyncStatusClient } from './interface-health-client'

export async function InterfaceSyncStatus({
  hostPromise,
  overviewPromise,
}: {
  hostPromise: Promise<InterfaceHostResolution>
  overviewPromise: Promise<InterfaceOverviewData | null>
}) {
  let data: [InterfaceHostResolution, InterfaceOverviewData | null]
  try {
    data = await Promise.all([hostPromise, overviewPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    // The sync stamp is decoration; a failure here must not blank the header.
    return null
  }
  const [resolution, overview] = data
  if (resolution.kind !== 'selected' || !overview) return null
  return <InterfaceSyncStatusClient lastSyncedAt={overview.lastSyncedAt} />
}
