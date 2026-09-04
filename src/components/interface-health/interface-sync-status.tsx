'use client'

import { use } from 'react'
import type { InterfaceLoadState, InterfaceOverviewPayload } from '@/lib/interface-health/query'

function fmtRelative(date: string | null): string {
  if (!date) return 'never'
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

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
