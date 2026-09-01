import { Suspense } from 'react'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import { resolveEndpointHost } from '@/lib/endpoints/query'
import { EndpointOverview } from './endpoint-overview'
import { EndpointResults } from './endpoint-results'
import { EndpointsClient } from './endpoints-client'
import {
  EndpointOverviewSkeleton,
  EndpointResultsSkeleton,
} from './endpoints-skeleton'

export async function EndpointsView({
  paramsPromise,
}: {
  paramsPromise: Promise<EndpointPageParams>
}) {
  const params = await paramsPromise
  const stableParamsPromise = Promise.resolve(params)
  const hostPromise = resolveEndpointHost(params.hostId)

  return (
    <EndpointsClient params={params}>
      <Suspense fallback={<EndpointOverviewSkeleton />}>
        <EndpointOverview paramsPromise={stableParamsPromise} hostPromise={hostPromise} />
      </Suspense>
      <Suspense fallback={<EndpointResultsSkeleton view={params.view} />}>
        <EndpointResults paramsPromise={stableParamsPromise} hostPromise={hostPromise} />
      </Suspense>
    </EndpointsClient>
  )
}
