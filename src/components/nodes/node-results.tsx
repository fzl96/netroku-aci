import { redirect } from 'next/navigation'
import type { NodePageParams } from '@/lib/nodes/params'
import { NodeReadError, type NodeHostResolution, type NodeResultsData } from '@/lib/nodes/query'
import { NodeResultsClient } from './nodes-client'
import { NodeRegionError } from './node-region-error'

export async function NodeResults({ paramsPromise, hostPromise, resultsPromise }: {
  paramsPromise: Promise<NodePageParams>
  hostPromise: Promise<NodeHostResolution>
  resultsPromise: Promise<NodeResultsData | null>
}) {
  let data: [NodePageParams, NodeHostResolution, NodeResultsData | null]
  try {
    data = await Promise.all([paramsPromise, hostPromise, resultsPromise])
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load results', error)
    return <NodeRegionError region="results" />
  }
  const [params, resolution, results] = data
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty' || !results) return null
  return <NodeResultsClient params={params} results={results} />
}
