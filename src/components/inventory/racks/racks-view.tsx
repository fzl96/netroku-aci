import { Suspense } from 'react'
import type { RacksParams } from '@/lib/inventory/racks/params'
import { RacksResults } from './racks-results'
import { RacksResultsSkeleton } from './racks-skeleton'

export function RacksView({
  paramsPromise,
}: {
  paramsPromise: Promise<RacksParams>
}) {
  return (
    <>
      <div className="px-8 pt-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
      </div>
      <Suspense fallback={<RacksResultsSkeleton />}>
        <RacksResults paramsPromise={paramsPromise} />
      </Suspense>
    </>
  )
}
