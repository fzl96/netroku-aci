import { redirect } from 'next/navigation'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import {
  getEndpointOverview,
  type EndpointHostResolution,
} from '@/lib/endpoints/query'
import { EndpointOverviewClient, NoEndpointHost } from './endpoints-client'
import { EndpointRegionError } from './endpoint-region-error'

export async function EndpointOverview({
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
    console.error('[endpoints] failed to resolve overview host', error)
    return <EndpointRegionError region="overview" />
  }

  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return <NoEndpointHost />

  let overview: Awaited<ReturnType<typeof getEndpointOverview>>
  try {
    overview = await getEndpointOverview(resolution.host.id)
  } catch (error) {
    console.error('[endpoints] failed to load overview', error)
    return <EndpointRegionError region="overview" />
  }

  return <EndpointOverviewClient key={params.query} params={params} overview={overview} />
}
