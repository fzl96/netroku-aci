import { Suspense } from 'react'
import type { NodePageParams } from '@/lib/nodes/params'
import { getNodeOverview, getNodeResults, getNodeTrend, resolveNodeHost } from '@/lib/nodes/query'
import { NodeHeaderActions } from './node-header-actions'
import { NodeOverview } from './node-overview'
import { NodeResults } from './node-results'
import { NodeTrend } from './node-trend'
import { NodesClient } from './nodes-client'
import {
  NodeHeaderActionsSkeleton,
  NodeOverviewSkeleton,
  NodeResultsSkeleton,
  NodeTrendSkeleton,
} from './nodes-skeleton'

async function ResolvedNodeResultsSkeleton({
  paramsPromise,
}: {
  paramsPromise: Promise<NodePageParams>
}) {
  return <NodeResultsSkeleton view={(await paramsPromise).view} />
}
function ResultsFallback({ paramsPromise }: { paramsPromise: Promise<NodePageParams> }) {
  return (
    <Suspense fallback={<NodeResultsSkeleton />}>
      <ResolvedNodeResultsSkeleton paramsPromise={paramsPromise} />
    </Suspense>
  )
}

export function NodesView({ paramsPromise }: { paramsPromise: Promise<NodePageParams> }) {
  const hostPromise = paramsPromise.then((params) => resolveNodeHost(params.hostId))
  const overviewPromise = hostPromise.then((resolution) =>
    resolution.kind === 'selected' ? getNodeOverview(resolution.host.id) : null,
  )
  const trendPromise = hostPromise.then((resolution) =>
    resolution.kind === 'selected' ? getNodeTrend(resolution.host.id) : null,
  )
  const resultsPromise = Promise.all([paramsPromise, hostPromise]).then(([params, resolution]) =>
    resolution.kind === 'selected'
      ? getNodeResults({ ...params, hostId: resolution.host.id })
      : null,
  )

  return (
    <NodesClient
      actions={
        <Suspense fallback={<NodeHeaderActionsSkeleton />}>
          <NodeHeaderActions
            paramsPromise={paramsPromise}
            hostPromise={hostPromise}
            overviewPromise={overviewPromise}
          />
        </Suspense>
      }
    >
      <Suspense fallback={<NodeOverviewSkeleton />}>
        <NodeOverview hostPromise={hostPromise} overviewPromise={overviewPromise} />
      </Suspense>
      <Suspense fallback={<NodeTrendSkeleton />}>
        <NodeTrend hostPromise={hostPromise} trendPromise={trendPromise} />
      </Suspense>
      <Suspense fallback={<ResultsFallback paramsPromise={paramsPromise} />}>
        <NodeResults
          paramsPromise={paramsPromise}
          hostPromise={hostPromise}
          resultsPromise={resultsPromise}
        />
      </Suspense>
    </NodesClient>
  )
}
