import { redirect } from 'next/navigation'
import type { NodePageParams } from '@/lib/nodes/params'
import { NodeReadError, type NodeHostResolution, type NodeOverviewData } from '@/lib/nodes/query'
import { NodeHeaderActionsClient } from './nodes-client'
import { NodeRegionError } from './node-region-error'

export async function NodeHeaderActions({ paramsPromise, hostPromise, overviewPromise }: {
  paramsPromise: Promise<NodePageParams>
  hostPromise: Promise<NodeHostResolution>
  overviewPromise: Promise<NodeOverviewData | null>
}) {
  let data: [NodePageParams, NodeHostResolution, NodeOverviewData | null]
  try {
    data = await Promise.all([paramsPromise, hostPromise, overviewPromise])
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load header actions', error)
    return <NodeRegionError region="overview" compact />
  }
  const [params, resolution, overview] = data
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty' || !overview) return null
  return <NodeHeaderActionsClient params={params} hosts={resolution.hosts} lastNodeSyncAt={overview.lastNodeSyncAt} />
}
