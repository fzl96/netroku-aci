import { Suspense } from 'react'
import type { DeviceListParams } from '@/lib/inventory/devices/params'
import { DevicesResults } from './devices-results'
import { DevicesResultsSkeleton } from './devices-skeleton'

export function DevicesView({ paramsPromise }: { paramsPromise: Promise<DeviceListParams> }) {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Devices</h1>
            <p className="mt-0.5 text-xs text-subtle">Physical device inventory</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<DevicesResultsSkeleton />}>
        <DevicesResults paramsPromise={paramsPromise} />
      </Suspense>
    </div>
  )
}
