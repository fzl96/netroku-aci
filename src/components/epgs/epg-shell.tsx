import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { EpgPageParams } from '@/lib/epgs/params'
import { EpgReadError, type EpgHostResolution } from '@/lib/epgs/query'
import { EpgFilters } from './epg-filters'
import { EpgHeaderActions } from './epg-header-actions'
import { EpgRegionError } from './epg-region-error'
import { EpgResults } from './epg-results'
import { EpgFilterSkeleton, EpgHeaderActionsSkeleton, EpgResultsSkeleton } from './epgs-skeleton'
import { EpgToolbarClient } from './epg-toolbar-client'
import { NoEpgHost } from './epg-empty-state'

async function EpgResultsFallback({ paramsPromise }: { paramsPromise: Promise<EpgPageParams> }) {
  const params = await paramsPromise
  return <EpgResultsSkeleton view={params.view} />
}

async function EpgBody({
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
    console.error('[epgs] failed to resolve host for page body', error)
    return <EpgRegionError region="overview" />
  }

  if (resolution.kind === 'redirect') redirect(resolution.location)
  if (resolution.kind === 'empty') return <NoEpgHost />

  const resolvedParams = Promise.resolve(params)
  const resolvedHost = Promise.resolve(resolution)

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Suspense fallback={<EpgFilterSkeleton />}>
          <EpgFilters paramsPromise={resolvedParams} hostPromise={resolvedHost} />
        </Suspense>
      </div>
      <Suspense fallback={<EpgResultsFallback paramsPromise={resolvedParams} />}>
        <EpgResults paramsPromise={resolvedParams} hostPromise={resolvedHost} />
      </Suspense>
    </>
  )
}

export function EpgShell({
  paramsPromise,
  hostPromise,
}: {
  paramsPromise: Promise<EpgPageParams>
  hostPromise: Promise<EpgHostResolution>
}) {
  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">EPG</h1>
            <p className="mt-0.5 text-xs text-subtle">
              Deployed EPGs and their static port bindings
            </p>
          </div>
          <Suspense fallback={<EpgHeaderActionsSkeleton />}>
            <EpgHeaderActions paramsPromise={paramsPromise} hostPromise={hostPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <EpgToolbarClient />
        <Suspense fallback={null}>
          <EpgBody paramsPromise={paramsPromise} hostPromise={hostPromise} />
        </Suspense>
      </main>
    </div>
  )
}
