import { Suspense } from 'react'
import type { EpgPageParams } from '@/lib/epgs/params'
import { resolveEpgHost } from '@/lib/epgs/query'
import { EpgHeaderActions } from './epg-header-actions'
import { EpgOverview } from './epg-overview'
import { EpgResults } from './epg-results'
import { EpgsClient } from './epgs-client'
import { EpgHeaderActionsSkeleton, EpgOverviewSkeleton, EpgResultsSkeleton } from './epgs-skeleton'

export function EpgsView({ paramsPromise }: { paramsPromise: Promise<EpgPageParams> }) {
  const hostPromise = paramsPromise.then(params => resolveEpgHost(params.hostId))
  return <EpgsClient actions={<Suspense fallback={<EpgHeaderActionsSkeleton />}><EpgHeaderActions paramsPromise={paramsPromise} hostPromise={hostPromise} /></Suspense>}>
    <Suspense fallback={<EpgOverviewSkeleton />}><EpgOverview paramsPromise={paramsPromise} hostPromise={hostPromise} /></Suspense>
    <Suspense fallback={<EpgResultsSkeleton />}><EpgResults paramsPromise={paramsPromise} hostPromise={hostPromise} /></Suspense>
  </EpgsClient>
}
