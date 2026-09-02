import { redirect } from 'next/navigation'
import type { EpgPageParams } from '@/lib/epgs/params'
import { EpgReadError, getEpgResults, type EpgHostResolution } from '@/lib/epgs/query'
import { EpgResultsClient } from './epgs-client'
import { EpgRegionError } from './epg-region-error'

export async function EpgResults({ paramsPromise, hostPromise }: { paramsPromise: Promise<EpgPageParams>; hostPromise: Promise<EpgHostResolution> }) {
  let params: EpgPageParams
  let resolution: EpgHostResolution
  try {
    ;[params, resolution] = await Promise.all([paramsPromise, hostPromise])
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load results', error)
    return <EpgRegionError region="results" />
  }
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return null
  let results: Awaited<ReturnType<typeof getEpgResults>>
  try { results = await getEpgResults(params) }
  catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load result data', error)
    return <EpgRegionError region="results" />
  }
  return <EpgResultsClient params={params} results={results} />
}
