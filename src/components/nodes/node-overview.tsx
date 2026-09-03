import { redirect } from 'next/navigation'
import { NodeReadError, type NodeHostResolution, type NodeOverviewData } from '@/lib/nodes/query'
import { NoNodeHost, NodeOverviewClient } from './nodes-client'
import { NodeRegionError } from './node-region-error'

export async function NodeOverview({
  hostPromise,
  overviewPromise,
}: {
  hostPromise: Promise<NodeHostResolution>
  overviewPromise: Promise<NodeOverviewData | null>
}) {
  let data: [NodeHostResolution, NodeOverviewData | null]
  try {
    data = await Promise.all([hostPromise, overviewPromise])
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load overview', error)
    return <NodeRegionError region="overview" />
  }
  const [resolution, overview] = data
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return <NoNodeHost />
  return overview ? <NodeOverviewClient overview={overview} /> : null
}
