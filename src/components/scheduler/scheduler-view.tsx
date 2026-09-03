import { Suspense } from 'react'
import { SchedulerResults } from './scheduler-results'
import { SchedulerResultsSkeleton } from './scheduler-skeleton'

export function SchedulerView() {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Scheduler</h1>
            <p className="mt-0.5 text-xs text-subtle">
              Automatic resyncs per controller, timed from the end of the previous run
            </p>
          </div>
        </div>
      </div>
      <Suspense fallback={<SchedulerResultsSkeleton />}>
        <SchedulerResults />
      </Suspense>
    </div>
  )
}
