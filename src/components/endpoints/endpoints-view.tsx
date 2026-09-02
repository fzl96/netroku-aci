import { Suspense } from 'react'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import { resolveEndpointHost } from '@/lib/endpoints/query'
import { EndpointHeaderActions } from './endpoint-header-actions'
import { EndpointOverview } from './endpoint-overview'
import { EndpointResults } from './endpoint-results'
import { EndpointsClient } from './endpoints-client'
import {
  EndpointHeaderActionsSkeleton,
  EndpointOverviewSkeleton,
  EndpointResultsSkeleton,
} from './endpoints-skeleton'

export function EndpointsView({
  paramsPromise,
}: {
  paramsPromise: Promise<EndpointPageParams>
}) {
  const hostPromise = paramsPromise.then(params => resolveEndpointHost(params.hostId))

  return (
    <EndpointsClient
      actions={(
        <Suspense fallback={<EndpointHeaderActionsSkeleton />}>
          <EndpointHeaderActions paramsPromise={paramsPromise} hostPromise={hostPromise} />
        </Suspense>
      )}
    >
      <Suspense fallback={<EndpointOverviewSkeleton />}>
        <EndpointOverview paramsPromise={paramsPromise} hostPromise={hostPromise} />
      </Suspense>
      <Suspense fallback={<EndpointResultsSkeleton />}>
        <EndpointResults paramsPromise={paramsPromise} hostPromise={hostPromise} />
      </Suspense>
    </EndpointsClient>
  )
}
