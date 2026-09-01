import { redirect } from 'next/navigation'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import {
  getEndpointResults,
  type EndpointHostResolution,
} from '@/lib/endpoints/query'
import { EndpointResultsClient } from './endpoints-client'
import { EndpointRegionError } from './endpoint-region-error'

export async function EndpointResults({
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
    console.error('[endpoints] failed to resolve results host', error)
    return <EndpointRegionError region="results" />
  }

  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return null

  let results: Awaited<ReturnType<typeof getEndpointResults>>
  try {
    results = await getEndpointResults(params)
  } catch (error) {
    console.error('[endpoints] failed to load results', error)
    return <EndpointRegionError region="results" />
  }

  return <EndpointResultsClient params={params} results={results} />
}
