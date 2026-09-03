import { Suspense } from 'react'
import type { LegacyInterfaceListState } from '@/lib/legacy/interfaces/params'
import { LegacyInterfaceFilters } from './interface-filters'
import { LegacyInterfaceResults } from './interface-results'
import { LegacyInterfaceSummary } from './interface-summary'
import { LegacyInterfacesFrame } from './interfaces-client'
import {
  LegacyInterfaceFiltersSkeleton,
  LegacyInterfaceResultsSkeleton,
  LegacyInterfaceSummarySkeleton,
} from './interfaces-skeleton'

export function LegacyInterfacesView({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyInterfaceListState>
}) {
  return (
    <LegacyInterfacesFrame>
      <Suspense fallback={<LegacyInterfaceSummarySkeleton />}>
        <LegacyInterfaceSummary />
      </Suspense>
      <Suspense fallback={<LegacyInterfaceFiltersSkeleton />}>
        <LegacyInterfaceFilters paramsPromise={paramsPromise} />
      </Suspense>
      <Suspense fallback={<LegacyInterfaceResultsSkeleton />}>
        <LegacyInterfaceResults paramsPromise={paramsPromise} />
      </Suspense>
    </LegacyInterfacesFrame>
  )
}
