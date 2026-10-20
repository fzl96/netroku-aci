import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import type { BdPageParams } from '@/lib/bds/params'
import {
  getBdOverview,
  getBdResults,
  resolveBdHost,
  type BdHostResolution,
  type BdLoadState,
  type BdOverviewPayload,
  type BdResultsPayload,
} from '@/lib/bds/query'
import { BdFilters } from './bd-filters'
import { BdHeaderActions } from './bd-header-actions'
import { BdRegionError } from './bd-region-error'
import { BdResults } from './bd-results'
import { BdFilterSkeleton, BdHeaderActionsSkeleton, BdResultsSkeleton } from './bd-skeleton'
import { SearchBar } from '@/components/search-bar'
import { NoBdHost } from './bd-empty-state'

type BdPageContext =
  | {
      kind: 'ready'
      params: BdPageParams
      resolution: Extract<BdHostResolution, { kind: 'selected' }>
    }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
  | { kind: 'error' }

async function resolvePageContext(paramsPromise: Promise<BdPageParams>): Promise<BdPageContext> {
  try {
    const params = await paramsPromise
    const resolution = await resolveBdHost(params.hostId)
    if (resolution.kind === 'redirect') {
      return { kind: 'redirect', location: resolution.location }
    }
    if (resolution.kind === 'empty') return { kind: 'empty' }
    return { kind: 'ready', params, resolution }
  } catch (error) {
    console.error('[bds] failed to resolve host for page body', error)
    return { kind: 'error' }
  }
}

async function loadOverview(
  pagePromise: Promise<BdPageContext>,
): Promise<BdLoadState<BdOverviewPayload>> {
  const context = await pagePromise
  if (context.kind === 'error') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }
  try {
    const overview = await getBdOverview(context.params)
    return {
      kind: 'ready',
      data: { params: context.params, hosts: context.resolution.hosts, overview },
    }
  } catch (error) {
    console.error('[bds] failed to load overview data', error)
    return { kind: 'error' }
  }
}

async function loadResults(
  pagePromise: Promise<BdPageContext>,
): Promise<BdLoadState<BdResultsPayload>> {
  const context = await pagePromise
  if (context.kind === 'error') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }
  try {
    const results = await getBdResults(context.params)
    return { kind: 'ready', data: { params: context.params, results } }
  } catch (error) {
    console.error('[bds] failed to load result data', error)
    return { kind: 'error' }
  }
}

async function BdBody({
  pagePromise,
  resultsPromise,
}: {
  pagePromise: Promise<BdPageContext>
  resultsPromise: Promise<BdLoadState<BdResultsPayload>>
}) {
  const context = await pagePromise
  if (context.kind === 'error') return <BdRegionError region="overview" />
  if (context.kind === 'redirect') redirect(context.location)
  if (context.kind === 'empty') return <NoBdHost />

  return (
    <Suspense fallback={<BdResultsSkeleton />}>
      <BdResults
        key={`${context.params.hostId}:${context.params.selected ?? ''}`}
        dataPromise={resultsPromise}
      />
    </Suspense>
  )
}

export function BdShell({ paramsPromise }: { paramsPromise: Promise<BdPageParams> }) {
  const pagePromise = resolvePageContext(paramsPromise)
  const overviewPromise = loadOverview(pagePromise)
  const resultsPromise = loadResults(pagePromise)

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Bridge Domains</h1>
            <p className="mt-0.5 text-xs text-subtle">
              Bridge Domain configuration and connected EPGs
            </p>
          </div>
          <Suspense fallback={<BdHeaderActionsSkeleton />}>
            <BdHeaderActions dataPromise={overviewPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBar
            text="Search BD, tenant, VRF, subnet, EPG…"
            className="min-w-[140px] flex-1 md:w-64 md:flex-none"
          />
          <Suspense fallback={<BdFilterSkeleton />}>
            <BdFilters dataPromise={overviewPromise} />
          </Suspense>
        </div>
        <BdBody pagePromise={pagePromise} resultsPromise={resultsPromise} />
      </main>
    </div>
  )
}
