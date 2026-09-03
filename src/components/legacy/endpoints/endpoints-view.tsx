import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'
import { LegacyEndpointFilters } from './endpoint-filters'
import { LegacyEndpointResults } from './endpoint-results'
import { LegacyEndpointSummary } from './endpoint-summary'
import {
  LegacyEndpointFiltersSkeleton,
  LegacyEndpointResultsSkeleton,
  LegacyEndpointSummarySkeleton,
} from './endpoints-skeleton'

export function LegacyEndpointsView({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyEndpointPageParams>
}) {
  return (
    <LegacyPageShell
      title="Legacy Endpoints"
      description="Current endpoint presence and retained placement lifecycle"
    >
      <Suspense fallback={<LegacyEndpointSummarySkeleton />}>
        <LegacyEndpointSummary />
      </Suspense>
      <Suspense fallback={<LegacyEndpointFiltersSkeleton />}>
        <LegacyEndpointFilters paramsPromise={paramsPromise} />
      </Suspense>
      <Suspense fallback={<LegacyEndpointResultsSkeleton />}>
        <LegacyEndpointResults paramsPromise={paramsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
