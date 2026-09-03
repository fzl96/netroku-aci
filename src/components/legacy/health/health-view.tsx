import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyHealthPageParams } from '@/lib/legacy/health/params'
import { LegacyHealthFilters } from './health-filters'
import { LegacyHealthResults } from './health-results'
import { LegacyHealthSummary } from './health-summary'
import {
  LegacyHealthFiltersSkeleton,
  LegacyHealthResultsSkeleton,
  LegacyHealthSummarySkeleton,
} from './health-skeleton'

export function LegacyHealthView({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyHealthPageParams>
}) {
  return (
    <LegacyPageShell
      title="Legacy Health"
      description="Latest device health, historical measurements, and collected logs"
    >
      <Suspense fallback={<LegacyHealthSummarySkeleton />}>
        <LegacyHealthSummary />
      </Suspense>
      <Suspense fallback={<LegacyHealthFiltersSkeleton />}>
        <LegacyHealthFilters paramsPromise={paramsPromise} />
      </Suspense>
      <Suspense fallback={<LegacyHealthResultsSkeleton />}>
        <LegacyHealthResults paramsPromise={paramsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
