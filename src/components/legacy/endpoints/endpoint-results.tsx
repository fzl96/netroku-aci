import type { LegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'
import { LegacyEndpointReadError, getLegacyEndpointResults } from '@/lib/legacy/endpoints/query'
import { LegacyEndpointResultsClient } from './endpoints-client'
import { LegacyEndpointRegionError } from './endpoint-region-error'

export async function LegacyEndpointResults({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyEndpointPageParams>
}) {
  const params = await paramsPromise
  let results: Awaited<ReturnType<typeof getLegacyEndpointResults>>
  try {
    results = await getLegacyEndpointResults(params)
  } catch (error) {
    if (!(error instanceof LegacyEndpointReadError)) throw error
    console.error('[legacy-endpoints] failed to load results', error)
    return <LegacyEndpointRegionError region="results" />
  }

  return <LegacyEndpointResultsClient results={results} />
}
