import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { EpgPageParams } from '@/lib/epgs/params'
import {
  EpgReadError,
  getEpgOverview,
  getEpgResults,
  resolveEpgHost,
  type EpgHostResolution,
  type EpgLoadState,
  type EpgOverviewPayload,
  type EpgResultsPayload,
} from '@/lib/epgs/query'
import { EpgFilters } from './epg-filters'
import { EpgHeaderActions } from './epg-header-actions'
import { EpgRegionError } from './epg-region-error'
import { EpgResults } from './epg-results'
import { EpgFilterSkeleton, EpgHeaderActionsSkeleton, EpgResultsSkeleton } from './epgs-skeleton'
import { EpgToolbarClient } from './epg-toolbar-client'
import { NoEpgHost } from './epg-empty-state'

type EpgPageContext =
  | {
      kind: 'ready'
      params: EpgPageParams
      resolution: Extract<EpgHostResolution, { kind: 'selected' }>
    }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }

async function resolvePageContext(paramsPromise: Promise<EpgPageParams>): Promise<EpgPageContext> {
  try {
    const params = await paramsPromise
    const resolution = await resolveEpgHost(params.hostId)
    if (resolution.kind === 'redirect') {
      return { kind: 'redirect', location: resolution.location }
    }
    if (resolution.kind === 'empty') return { kind: 'empty' }
    return { kind: 'ready', params, resolution }
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to resolve host for page body', error)
    return { kind: 'unauthorized' }
  }
}

async function loadOverview(
  pagePromise: Promise<EpgPageContext>,
): Promise<EpgLoadState<EpgOverviewPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }
  try {
    const overview = await getEpgOverview(context.resolution.host.id, context.params)
    return {
      kind: 'ready',
      data: { params: context.params, hosts: context.resolution.hosts, overview },
    }
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load overview data', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  pagePromise: Promise<EpgPageContext>,
): Promise<EpgLoadState<EpgResultsPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }
  try {
    const results = await getEpgResults(context.params)
    return { kind: 'ready', data: { params: context.params, results } }
  } catch (error) {
    if (!(error instanceof EpgReadError)) throw error
    console.error('[epgs] failed to load result data', error)
    return { kind: 'unauthorized' }
  }
}

async function EpgBody({
  pagePromise,
  overviewPromise,
  resultsPromise,
}: {
  pagePromise: Promise<EpgPageContext>
  overviewPromise: Promise<EpgLoadState<EpgOverviewPayload>>
  resultsPromise: Promise<EpgLoadState<EpgResultsPayload>>
}) {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return <EpgRegionError region="overview" />
  if (context.kind === 'redirect') redirect(context.location)
  if (context.kind === 'empty') return <NoEpgHost />

  return (
    <Suspense fallback={<EpgResultsSkeleton view={context.params.view} />}>
      <EpgResults dataPromise={resultsPromise} />
    </Suspense>
  )
}

export function EpgShell({ paramsPromise }: { paramsPromise: Promise<EpgPageParams> }) {
  const pagePromise = resolvePageContext(paramsPromise)
  const overviewPromise = loadOverview(pagePromise)
  const resultsPromise = loadResults(pagePromise)

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
            <EpgHeaderActions dataPromise={overviewPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center gap-3">
          <EpgToolbarClient />
          <Suspense fallback={<EpgFilterSkeleton />}>
            <EpgFilters dataPromise={overviewPromise} />
          </Suspense>
        </div>
        <EpgBody
          pagePromise={pagePromise}
          overviewPromise={overviewPromise}
          resultsPromise={resultsPromise}
        />
      </main>
    </div>
  )
}
