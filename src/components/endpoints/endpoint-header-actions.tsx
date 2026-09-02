import { redirect } from 'next/navigation'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import {
  EndpointReadError,
  getEndpointOverview,
  getEndpointResults,
  type EndpointHostResolution,
} from '@/lib/endpoints/query'
import { EndpointHeaderActionsClient } from './endpoints-client'
import { EndpointRegionError } from './endpoint-region-error'

export async function EndpointHeaderActions({
  paramsPromise,
  hostPromise,
}: {
  paramsPromise: Promise<EndpointPageParams>
  hostPromise: Promise<EndpointHostResolution>
}) {
  let params: EndpointPageParams
  let resolution: EndpointHostResolution
  try {
    ;[params, resolution] = await Promise.all([paramsPromise, hostPromise])
  } catch (error) {
    if (!(error instanceof EndpointReadError)) throw error
    console.error('[endpoints] failed to authorize header actions', error)
    return <EndpointRegionError region="overview" compact />
  }

  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return null

  let overview: Awaited<ReturnType<typeof getEndpointOverview>>
  let results: Awaited<ReturnType<typeof getEndpointResults>>
  try {
    ;[overview, results] = await Promise.all([
      getEndpointOverview(resolution.host.id),
      getEndpointResults(params),
    ])
  } catch (error) {
    if (!(error instanceof EndpointReadError)) throw error
    console.error('[endpoints] failed to authorize header action data', error)
    return <EndpointRegionError region="overview" compact />
  }

  return (
    <EndpointHeaderActionsClient
      params={params}
      hosts={resolution.hosts}
      hostTotal={overview.activeTotal + overview.historicalTotal}
      filteredTotal={results.pagination.total}
    />
  )
}
