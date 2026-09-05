'use client'

import { use } from 'react'
import type { InterfaceLoadState, InterfaceOverviewPayload } from '@/lib/interface-health/query'
import { fmtRelative } from '@/lib/interface-health/format'

export function InterfaceSyncStatus({
  dataPromise,
}: {
  dataPromise: Promise<InterfaceLoadState<InterfaceOverviewPayload>>
}) {
  const state = use(dataPromise)
  // The sync stamp is decoration; a failure here must not blank the header.
  if (state.kind !== 'ready') return null

  return <> · last synced {fmtRelative(state.data.overview.lastSyncedAt)}</>
}
