import { redirect } from 'next/navigation'
import { NodeReadError, type NodeHostResolution, type NodeTrendPoint } from '@/lib/nodes/query'
import { NodeTrendClient } from './nodes-client'
import { NodeRegionError } from './node-region-error'

export async function NodeTrend({ hostPromise, trendPromise }: {
  hostPromise: Promise<NodeHostResolution>
  trendPromise: Promise<NodeTrendPoint[] | null>
}) {
  let data: [NodeHostResolution, NodeTrendPoint[] | null]
  try {
    data = await Promise.all([hostPromise, trendPromise])
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load trend', error)
    return <NodeRegionError region="trend" />
  }
  const [resolution, trend] = data
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty' || !trend) return null
  return <NodeTrendClient trend={trend} />
}
