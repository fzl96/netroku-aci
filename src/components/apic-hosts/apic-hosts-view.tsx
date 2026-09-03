import { Suspense } from 'react'
import { ApicHostsResults } from './apic-hosts-results'
import { ApicHostsResultsSkeleton } from './apic-hosts-skeleton'

export function ApicHostsView() {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">APIC Hosts</h1>
            <p className="mt-0.5 text-xs text-subtle">Manage shared APIC controller endpoints</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<ApicHostsResultsSkeleton />}>
        <ApicHostsResults />
      </Suspense>
    </div>
  )
}
