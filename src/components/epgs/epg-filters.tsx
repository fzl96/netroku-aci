import { redirect } from 'next/navigation'
import type { EpgPageParams } from '@/lib/epgs/params'
import { EpgReadError, getEpgOverview, type EpgHostResolution } from '@/lib/epgs/query'
import { EpgFiltersClient } from './epg-filters-client'
import { EpgRegionError } from './epg-region-error'

export async function EpgFilters({
  paramsPromise,
  hostPromise,
}: {
  paramsPromise: Promise<EpgPageParams>
  hostPromise: Promise<EpgHostResolution>
}) {
  let params: EpgPageParams
  let resolution: EpgHostResolution
  try {
    ;[params, resolution] = await Promise.all([paramsPromise, hostPromise])
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load filters', error)
    return <EpgRegionError region="overview" />
  }
  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return null

  let overview: Awaited<ReturnType<typeof getEpgOverview>>
  try {
    overview = await getEpgOverview(resolution.host.id, params)
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load filter data', error)
    return <EpgRegionError region="overview" />
  }

  return (
    <EpgFiltersClient
      params={params}
      choices={overview.choices}
      lastEpgSyncAt={overview.lastEpgSyncAt}
    />
  )
}
