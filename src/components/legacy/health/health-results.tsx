import type { LegacyHealthPageParams } from '@/lib/legacy/health/params'
import { LegacyHealthReadError, getLegacyHealthResults } from '@/lib/legacy/health/query'
import { LegacyHealthResultsClient } from './health-client'
import { LegacyHealthRegionError } from './health-region-error'

export async function LegacyHealthResults({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyHealthPageParams>
}) {
  const params = await paramsPromise
  let results: Awaited<ReturnType<typeof getLegacyHealthResults>>
  try {
    results = await getLegacyHealthResults(params)
  } catch (error) {
    if (!(error instanceof LegacyHealthReadError)) throw error
    console.error('[legacy-health] failed to load results', error)
    return <LegacyHealthRegionError region="results" />
  }

  return <LegacyHealthResultsClient results={results} />
}
