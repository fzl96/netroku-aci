import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { IconServer } from '@tabler/icons-react'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import {
  EndpointReadError,
  getEndpointOverview,
  getEndpointResults,
  resolveEndpointHost,
  type EndpointHostResolution,
  type EndpointLoadState,
  type EndpointOverviewPayload,
  type EndpointResultsPayload,
} from '@/lib/endpoints/query'
import { EndpointHeaderActions } from './endpoint-header-actions'
import { EndpointOverview } from './endpoint-overview'
import { EndpointRegionError } from './endpoint-region-error'
import { EndpointResults } from './endpoint-results'
import {
  EndpointHeaderActionsSkeleton,
  EndpointOverviewSkeleton,
  EndpointResultsSkeleton,
} from './endpoints-skeleton'

type EndpointPageContext =
  | {
      kind: 'ready'
      params: EndpointPageParams
      resolution: Extract<EndpointHostResolution, { kind: 'selected' }>
    }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }

async function resolvePageContext(
  paramsPromise: Promise<EndpointPageParams>,
): Promise<EndpointPageContext> {
  try {
    const params = await paramsPromise
    const resolution = await resolveEndpointHost(params.hostId)
    if (resolution.kind === 'redirect') {
      return { kind: 'redirect', location: resolution.location }
    }
    if (resolution.kind === 'empty') return { kind: 'empty' }
    return { kind: 'ready', params, resolution }
  } catch (error) {
    if (!(error instanceof EndpointReadError)) throw error
    console.error('[endpoints] failed to resolve host for page body', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  pagePromise: Promise<EndpointPageContext>,
): Promise<EndpointLoadState<EndpointResultsPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const results = await getEndpointResults(context.params)
    return { kind: 'ready', data: { params: context.params, results } }
  } catch (error) {
    if (!(error instanceof EndpointReadError)) throw error
    console.error('[endpoints] failed to load result data', error)
    return { kind: 'unauthorized' }
  }
}

async function loadOverview(
  pagePromise: Promise<EndpointPageContext>,
  resultsPromise: Promise<EndpointLoadState<EndpointResultsPayload>>,
): Promise<EndpointLoadState<EndpointOverviewPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const [overview, resultsState] = await Promise.all([
      getEndpointOverview(context.resolution.host.id),
      resultsPromise,
    ])
    if (resultsState.kind !== 'ready') return resultsState
    return {
      kind: 'ready',
      data: {
        params: context.params,
        hosts: context.resolution.hosts,
        overview,
        filteredTotal: resultsState.data.results.pagination.total,
      },
    }
  } catch (error) {
    if (!(error instanceof EndpointReadError)) throw error
    console.error('[endpoints] failed to load overview data', error)
    return { kind: 'unauthorized' }
  }
}

function NoEndpointHost() {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center">
      <div className="relative mb-6">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
          <IconServer size={24} stroke={1.25} className="text-faint" />
        </div>
        <span className="absolute -top-1 -right-1 size-3 rounded-full border-2 border-background bg-border" />
      </div>
      <h2 className="mb-1 font-serif text-base font-semibold text-foreground">
        No APIC host selected
      </h2>
      <p className="mb-6 max-w-[260px] text-xs leading-relaxed text-subtle">
        No APIC hosts are configured yet. Add one in Settings to get started.
      </p>
    </div>
  )
}

async function EndpointBody({
  pagePromise,
  overviewPromise,
  resultsPromise,
}: {
  pagePromise: Promise<EndpointPageContext>
  overviewPromise: Promise<EndpointLoadState<EndpointOverviewPayload>>
  resultsPromise: Promise<EndpointLoadState<EndpointResultsPayload>>
}) {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return <EndpointRegionError region="overview" />
  if (context.kind === 'redirect') redirect(context.location)
  if (context.kind === 'empty') return <NoEndpointHost />

  return (
    <>
      <Suspense fallback={<EndpointOverviewSkeleton />}>
        <EndpointOverview dataPromise={overviewPromise} />
      </Suspense>
      <Suspense fallback={<EndpointResultsSkeleton view={context.params.view} />}>
        <EndpointResults dataPromise={resultsPromise} />
      </Suspense>
    </>
  )
}

export function EndpointsShell({ paramsPromise }: { paramsPromise: Promise<EndpointPageParams> }) {
  const pagePromise = resolvePageContext(paramsPromise)
  const resultsPromise = loadResults(pagePromise)
  const overviewPromise = loadOverview(pagePromise, resultsPromise)

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Endpoints</h1>
            <p className="mt-0.5 text-xs text-subtle">ACI fabric endpoint inventory</p>
          </div>
          <Suspense fallback={<EndpointHeaderActionsSkeleton />}>
            <EndpointHeaderActions dataPromise={overviewPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <EndpointBody
          pagePromise={pagePromise}
          overviewPromise={overviewPromise}
          resultsPromise={resultsPromise}
        />
      </main>
    </div>
  )
}
