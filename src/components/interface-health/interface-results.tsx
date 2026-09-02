import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import {
  InterfaceReadError,
  type InterfaceHostResolution,
  type InterfaceResultsData,
} from '@/lib/interface-health/query'
import { InterfaceResultsClient, NoInterfaceHost } from './interface-health-client'
import { InterfaceRegionError } from './interface-region-error'

export async function InterfaceResults({
  paramsPromise,
  hostPromise,
  resultsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  hostPromise: Promise<InterfaceHostResolution>
  resultsPromise: Promise<InterfaceResultsData | null>
}) {
  let data: [InterfaceHealthPageParams, InterfaceHostResolution, InterfaceResultsData | null]
  try {
    data = await Promise.all([paramsPromise, hostPromise, resultsPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load results', error)
    return <InterfaceRegionError region="results" />
  }
  const [params, resolution, results] = data
  if (resolution.kind === 'empty') return <NoInterfaceHost />
  if (!results) return null
  return <InterfaceResultsClient params={params} results={results} />
}
