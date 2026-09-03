import { Suspense } from 'react'
import { SchedulerResults } from './scheduler-results'
import { SchedulerResultsSkeleton } from './scheduler-skeleton'

export function SchedulerView() {
  return (
    <Suspense fallback={<SchedulerResultsSkeleton />}>
      <SchedulerResults />
    </Suspense>
  )
}
