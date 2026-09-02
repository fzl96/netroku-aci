import { Suspense } from 'react'
import type { RawRacksSearchParams } from './racks-results'
import { RacksResults } from './racks-results'
import { RacksResultsSkeleton } from './racks-skeleton'

export function RacksView({
  searchParamsPromise,
}: {
  searchParamsPromise: Promise<RawRacksSearchParams>
}) {
  return (
    <Suspense fallback={<RacksResultsSkeleton />}>
      <RacksResults searchParamsPromise={searchParamsPromise} />
    </Suspense>
  )
}
