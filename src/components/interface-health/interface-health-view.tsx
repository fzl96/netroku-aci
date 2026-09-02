import { Suspense } from 'react'
import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import {
  getInterfaceCrcWindow,
  getInterfaceOverview,
  getInterfaceResults,
  resolveInterfaceHost,
} from '@/lib/interface-health/query'
import { InterfaceControls } from './interface-controls'
import { InterfaceCrcTrend } from './interface-crc-trend'
import { InterfaceHeaderActions } from './interface-header-actions'
import { InterfaceHealthFrame } from './interface-health-client'
import {
  InterfaceControlsSkeleton,
  InterfaceCrcTrendSkeleton,
  InterfaceHeaderActionsSkeleton,
  InterfaceNodeFilterSkeleton,
  InterfaceResultsSkeleton,
  InterfaceSummarySkeleton,
} from './interface-health-skeleton'
import { InterfaceNodeFilter } from './interface-node-filter'
import { InterfaceResults } from './interface-results'
import { InterfaceSummary } from './interface-summary'
import { InterfaceSyncStatus } from './interface-sync-status'

/** The trend only exists in the CRC view, so its fallback resolves the view
 *  first rather than reserving chart height on every page. */
async function ResolvedCrcTrendSkeleton({
  paramsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
}) {
  return (await paramsPromise).view === 'crc' ? <InterfaceCrcTrendSkeleton /> : null
}

function CrcTrendFallback({ paramsPromise }: { paramsPromise: Promise<InterfaceHealthPageParams> }) {
  return (
    <Suspense fallback={null}>
      <ResolvedCrcTrendSkeleton paramsPromise={paramsPromise} />
    </Suspense>
  )
}

export function InterfaceHealthView({
  paramsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
}) {
  // Host resolution is shared so redirect and selection happen once per request.
  const hostPromise = paramsPromise.then(params => resolveInterfaceHost(params.hostId))
  const overviewPromise = hostPromise.then(resolution =>
    resolution.kind === 'selected' ? getInterfaceOverview(resolution.host.id) : null)
  const crcWindowPromise = Promise.all([paramsPromise, hostPromise]).then(([params, resolution]) =>
    resolution.kind === 'selected' && params.view === 'crc'
      ? getInterfaceCrcWindow(resolution.host.id, params.window)
      : null)
  const resultsPromise = Promise.all([paramsPromise, hostPromise, crcWindowPromise])
    .then(([params, resolution, crcWindow]) =>
      resolution.kind === 'selected'
        ? getInterfaceResults({ ...params, hostId: resolution.host.id }, crcWindow)
        : null)

  return (
    <InterfaceHealthFrame
      syncStatus={
        <Suspense fallback={null}>
          <InterfaceSyncStatus hostPromise={hostPromise} overviewPromise={overviewPromise} />
        </Suspense>
      }
      actions={
        <Suspense fallback={<InterfaceHeaderActionsSkeleton />}>
          <InterfaceHeaderActions paramsPromise={paramsPromise} />
        </Suspense>
      }
    >
      <Suspense fallback={<InterfaceControlsSkeleton />}>
        <InterfaceControls
          paramsPromise={paramsPromise}
          hostPromise={hostPromise}
          nodeFilter={
            <Suspense fallback={<InterfaceNodeFilterSkeleton />}>
              <InterfaceNodeFilter paramsPromise={paramsPromise} overviewPromise={overviewPromise} />
            </Suspense>
          }
          summary={
            <Suspense fallback={<InterfaceSummarySkeleton />}>
              <InterfaceSummary paramsPromise={paramsPromise} resultsPromise={resultsPromise} />
            </Suspense>
          }
        />
      </Suspense>

      <Suspense fallback={<CrcTrendFallback paramsPromise={paramsPromise} />}>
        <InterfaceCrcTrend paramsPromise={paramsPromise} crcWindowPromise={crcWindowPromise} />
      </Suspense>

      <Suspense fallback={<InterfaceResultsSkeleton />}>
        <InterfaceResults
          paramsPromise={paramsPromise}
          hostPromise={hostPromise}
          resultsPromise={resultsPromise}
        />
      </Suspense>
    </InterfaceHealthFrame>
  )
}
