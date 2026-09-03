import { Suspense } from 'react'
import { ApicHostsResults } from './apic-hosts-results'
import { ApicHostsResultsSkeleton } from './apic-hosts-skeleton'

export function ApicHostsView() {
  return (
    <Suspense fallback={<ApicHostsResultsSkeleton />}>
      <ApicHostsResults />
    </Suspense>
  )
}
