import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { IconServer } from '@tabler/icons-react'
import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import {
  getInterfaceCrcWindow,
  getInterfaceOverview,
  getInterfaceResults,
  InterfaceReadError,
  resolveInterfaceHost,
  type InterfaceCrcTrendPayload,
  type InterfaceCrcWindowData,
  type InterfaceHostResolution,
  type InterfaceLoadState,
  type InterfaceOverviewPayload,
  type InterfaceResultsPayload,
} from '@/lib/interface-health/query'
import { InterfaceControls } from './interface-controls'
import { InterfaceCrcTrend } from './interface-crc-trend'
import { InterfaceHeaderActions } from './interface-header-actions'
import {
  InterfaceControlsSkeleton,
  InterfaceCrcTrendSkeleton,
  InterfaceHeaderActionsSkeleton,
  InterfaceNodeFilterSkeleton,
  InterfaceResultsSkeleton,
  InterfaceSummarySkeleton,
} from './interface-health-skeleton'
import { InterfaceNodeFilter } from './interface-node-filter'
import { InterfaceRegionError } from './interface-region-error'
import { InterfaceResults } from './interface-results'
import { InterfaceSummary } from './interface-summary'
import { InterfaceSyncStatus } from './interface-sync-status'

type InterfacePageContext =
  | {
      kind: 'ready'
      params: InterfaceHealthPageParams
      resolution: Extract<InterfaceHostResolution, { kind: 'selected' }>
    }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }

async function resolvePageContext(
  paramsPromise: Promise<InterfaceHealthPageParams>,
): Promise<InterfacePageContext> {
  try {
    const params = await paramsPromise
    const resolution = await resolveInterfaceHost(params.hostId)
    if (resolution.kind === 'redirect') {
      return { kind: 'redirect', location: resolution.location }
    }
    if (resolution.kind === 'empty') return { kind: 'empty' }
    return { kind: 'ready', params, resolution }
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to resolve host for page body', error)
    return { kind: 'unauthorized' }
  }
}

async function loadOverview(
  pagePromise: Promise<InterfacePageContext>,
): Promise<InterfaceLoadState<InterfaceOverviewPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const overview = await getInterfaceOverview(context.resolution.host.id)
    return { kind: 'ready', data: { params: context.params, overview } }
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load overview data', error)
    return { kind: 'unauthorized' }
  }
}

/** Raw (unwrapped) CRC window read, started once and shared by both the trend
 *  chart and the results table so the CRC view never queries samples twice. */
async function loadCrcWindowData(
  pagePromise: Promise<InterfacePageContext>,
): Promise<InterfaceCrcWindowData | null> {
  const context = await pagePromise
  if (context.kind !== 'ready' || context.params.view !== 'crc') return null
  return getInterfaceCrcWindow(context.resolution.host.id, context.params.window)
}

async function loadCrcTrend(
  pagePromise: Promise<InterfacePageContext>,
  crcWindowDataPromise: Promise<InterfaceCrcWindowData | null>,
): Promise<InterfaceLoadState<InterfaceCrcTrendPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready' || context.params.view !== 'crc') return { kind: 'inactive' }

  try {
    const crcWindow = await crcWindowDataPromise
    if (!crcWindow) return { kind: 'inactive' }
    return { kind: 'ready', data: { trend: crcWindow.trend } }
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load CRC trend', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  pagePromise: Promise<InterfacePageContext>,
  crcWindowDataPromise: Promise<InterfaceCrcWindowData | null>,
): Promise<InterfaceLoadState<InterfaceResultsPayload>> {
  const context = await pagePromise
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const crcWindow = context.params.view === 'crc' ? await crcWindowDataPromise : null
    const results = await getInterfaceResults(
      { ...context.params, hostId: context.resolution.host.id },
      crcWindow,
    )
    return { kind: 'ready', data: { params: context.params, results } }
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load result data', error)
    return { kind: 'unauthorized' }
  }
}

function NoInterfaceHost() {
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
      <p className="max-w-[260px] text-xs leading-relaxed text-subtle">
        No APIC hosts are configured yet. Add one in Settings to get started.
      </p>
    </div>
  )
}

async function InterfaceControlsGate({
  pagePromise,
  paramsPromise,
  overviewPromise,
  resultsPromise,
}: {
  pagePromise: Promise<InterfacePageContext>
  paramsPromise: Promise<InterfaceHealthPageParams>
  overviewPromise: Promise<InterfaceLoadState<InterfaceOverviewPayload>>
  resultsPromise: Promise<InterfaceLoadState<InterfaceResultsPayload>>
}) {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return <InterfaceRegionError region="filters" />
  if (context.kind === 'redirect') redirect(context.location)
  if (context.kind === 'empty') return <NoInterfaceHost />

  return (
    <InterfaceControls
      paramsPromise={paramsPromise}
      nodeFilter={
        <Suspense fallback={<InterfaceNodeFilterSkeleton />}>
          <InterfaceNodeFilter dataPromise={overviewPromise} />
        </Suspense>
      }
      summary={
        <Suspense fallback={<InterfaceSummarySkeleton />}>
          <InterfaceSummary dataPromise={resultsPromise} />
        </Suspense>
      }
    />
  )
}

async function InterfaceCrcGate({
  pagePromise,
  crcTrendPromise,
}: {
  pagePromise: Promise<InterfacePageContext>
  crcTrendPromise: Promise<InterfaceLoadState<InterfaceCrcTrendPayload>>
}) {
  const context = await pagePromise
  if (context.kind !== 'ready' || context.params.view !== 'crc') return null
  return (
    <Suspense fallback={<InterfaceCrcTrendSkeleton />}>
      <InterfaceCrcTrend dataPromise={crcTrendPromise} />
    </Suspense>
  )
}

export function InterfaceHealthShell({
  paramsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
}) {
  const pagePromise = resolvePageContext(paramsPromise)
  const overviewPromise = loadOverview(pagePromise)
  const crcWindowDataPromise = loadCrcWindowData(pagePromise)
  const crcTrendPromise = loadCrcTrend(pagePromise, crcWindowDataPromise)
  const resultsPromise = loadResults(pagePromise, crcWindowDataPromise)

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Interfaces</h1>
            <p className="mt-0.5 text-xs text-subtle">
              Status, error, and utilisation counters
              <Suspense fallback={null}>
                <InterfaceSyncStatus dataPromise={overviewPromise} />
              </Suspense>
            </p>
          </div>
          <Suspense fallback={<InterfaceHeaderActionsSkeleton />}>
            <InterfaceHeaderActions paramsPromise={paramsPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <Suspense fallback={<InterfaceControlsSkeleton />}>
          <InterfaceControlsGate
            pagePromise={pagePromise}
            paramsPromise={paramsPromise}
            overviewPromise={overviewPromise}
            resultsPromise={resultsPromise}
          />
        </Suspense>
        <Suspense fallback={null}>
          <InterfaceCrcGate pagePromise={pagePromise} crcTrendPromise={crcTrendPromise} />
        </Suspense>
        <Suspense fallback={<InterfaceResultsSkeleton />}>
          <InterfaceResults dataPromise={resultsPromise} />
        </Suspense>
      </main>
    </div>
  )
}
