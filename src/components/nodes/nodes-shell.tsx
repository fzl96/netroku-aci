import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { IconServer } from '@tabler/icons-react'
import type { NodePageParams } from '@/lib/nodes/params'
import {
  getNodeOverview,
  getNodeResults,
  getNodeTrend,
  NodeReadError,
  resolveNodeHost,
  type NodeHostResolution,
  type NodeLoadState,
  type NodeOverviewPayload,
  type NodeResultsPayload,
  type NodeTrendPayload,
} from '@/lib/nodes/query'
import { NodeHeaderActions } from './node-header-actions'
import { NodeOverview } from './node-overview'
import { NodeRegionError } from './node-region-error'
import { NodeResults } from './node-results'
import { NodeTrend } from './node-trend'
import {
  NodeHeaderActionsSkeleton,
  NodeOverviewSkeleton,
  NodeResultsSkeleton,
  NodeTrendSkeleton,
} from './nodes-skeleton'

type NodePageContext =
  | {
      kind: 'ready'
      params: NodePageParams
      resolution: Extract<NodeHostResolution, { kind: 'selected' }>
    }
  | { kind: 'redirect'; location: string }
  | { kind: 'empty' }
  | { kind: 'unauthorized' }

async function resolvePageContext(
  paramsPromise: Promise<NodePageParams>,
): Promise<NodePageContext> {
  try {
    const params = await paramsPromise
    const resolution = await resolveNodeHost(params.hostId)
    if (resolution.kind === 'redirect') {
      return { kind: 'redirect', location: resolution.location }
    }
    if (resolution.kind === 'empty') return { kind: 'empty' }
    return { kind: 'ready', params, resolution }
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to resolve host for page body', error)
    return { kind: 'unauthorized' }
  }
}

async function loadOverview(
  pagePromise: Promise<NodePageContext>,
): Promise<NodeLoadState<NodeOverviewPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const overview = await getNodeOverview(context.resolution.host.id)
    return {
      kind: 'ready',
      data: { params: context.params, hosts: context.resolution.hosts, overview },
    }
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load overview data', error)
    return { kind: 'unauthorized' }
  }
}

async function loadTrend(
  pagePromise: Promise<NodePageContext>,
): Promise<NodeLoadState<NodeTrendPayload>> {
  const context = await pagePromise
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const trend = await getNodeTrend(context.resolution.host.id)
    return { kind: 'ready', data: { trend } }
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load trend data', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  pagePromise: Promise<NodePageContext>,
): Promise<NodeLoadState<NodeResultsPayload>> {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return context
  if (context.kind !== 'ready') return { kind: 'inactive' }

  try {
    const results = await getNodeResults(context.params)
    return { kind: 'ready', data: { params: context.params, results } }
  } catch (error) {
    if (!(error instanceof NodeReadError)) throw error
    console.error('[nodes] failed to load result data', error)
    return { kind: 'unauthorized' }
  }
}

function NoNodeHost() {
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

async function NodeOverviewGate({
  pagePromise,
  overviewPromise,
}: {
  pagePromise: Promise<NodePageContext>
  overviewPromise: Promise<NodeLoadState<NodeOverviewPayload>>
}) {
  const context = await pagePromise
  if (context.kind === 'unauthorized') return <NodeRegionError region="overview" />
  if (context.kind === 'redirect') redirect(context.location)
  if (context.kind === 'empty') return <NoNodeHost />
  return <NodeOverview dataPromise={overviewPromise} />
}

async function NodeResultsGate({
  pagePromise,
  resultsPromise,
}: {
  pagePromise: Promise<NodePageContext>
  resultsPromise: Promise<NodeLoadState<NodeResultsPayload>>
}) {
  const context = await pagePromise
  if (context.kind !== 'ready') return null
  return (
    <Suspense fallback={<NodeResultsSkeleton view={context.params.view} />}>
      <NodeResults dataPromise={resultsPromise} />
    </Suspense>
  )
}

export function NodesShell({ paramsPromise }: { paramsPromise: Promise<NodePageParams> }) {
  const pagePromise = resolvePageContext(paramsPromise)
  const overviewPromise = loadOverview(pagePromise)
  const trendPromise = loadTrend(pagePromise)
  const resultsPromise = loadResults(pagePromise)

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col justify-between gap-3 px-4 py-3 md:h-16 md:flex-row md:items-center md:px-8 md:py-0">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Nodes</h1>
            <p className="mt-0.5 text-xs text-subtle">Fabric node inventory and PSU/fan health</p>
          </div>
          <Suspense fallback={<NodeHeaderActionsSkeleton />}>
            <NodeHeaderActions dataPromise={overviewPromise} />
          </Suspense>
        </div>
      </header>
      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <Suspense fallback={<NodeOverviewSkeleton />}>
          <NodeOverviewGate pagePromise={pagePromise} overviewPromise={overviewPromise} />
        </Suspense>
        <Suspense fallback={<NodeTrendSkeleton />}>
          <NodeTrend dataPromise={trendPromise} />
        </Suspense>
        <Suspense fallback={<NodeResultsSkeleton />}>
          <NodeResultsGate pagePromise={pagePromise} resultsPromise={resultsPromise} />
        </Suspense>
      </main>
    </div>
  )
}
