import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import { InterfaceReadError, type InterfaceHostResolution } from '@/lib/interface-health/query'
import { InterfaceControlsClient } from './interface-health-client'
import { InterfaceRegionError } from './interface-region-error'

export async function InterfaceControls({
  paramsPromise,
  hostPromise,
  nodeFilter,
  summary,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  hostPromise: Promise<InterfaceHostResolution>
  nodeFilter: ReactNode
  summary: ReactNode
}) {
  let data: [InterfaceHealthPageParams, InterfaceHostResolution]
  try {
    data = await Promise.all([paramsPromise, hostPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to resolve host', error)
    return <InterfaceRegionError region="filters" />
  }
  const [params, resolution] = data
  if (resolution.kind === 'redirect') redirect(resolution.location)
  // With no host configured the results region owns the empty state.
  if (resolution.kind === 'empty') return null
  return <InterfaceControlsClient params={params} nodeFilter={nodeFilter} summary={summary} />
}
