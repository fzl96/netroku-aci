import { redirect } from 'next/navigation'
import type { EpgPageParams } from '@/lib/epgs/params'
import { EpgReadError, getEpgOverview, type EpgHostResolution } from '@/lib/epgs/query'
import { EpgOverviewClient, NoEpgHost } from './epgs-client'
import { EpgRegionError } from './epg-region-error'

export async function EpgOverview({ paramsPromise, hostPromise }: { paramsPromise: Promise<EpgPageParams>; hostPromise: Promise<EpgHostResolution> }) {
  let params: EpgPageParams
  let resolution: EpgHostResolution
  try {
    ;[params, resolution] = await Promise.all([paramsPromise, hostPromise])
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load overview', error)
    return <EpgRegionError region="overview" />
  }
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return <NoEpgHost />
  let overview: Awaited<ReturnType<typeof getEpgOverview>>
  try { overview = await getEpgOverview(resolution.host.id, params) }
  catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load overview data', error)
    return <EpgRegionError region="overview" />
  }
  return <EpgOverviewClient key={params.query} params={params} overview={overview} />
}
