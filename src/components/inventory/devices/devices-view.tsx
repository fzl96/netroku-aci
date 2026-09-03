import { Suspense } from 'react'
import type { DeviceListParams } from '@/lib/inventory/devices/params'
import { DevicesResults } from './devices-results'
import { DevicesResultsSkeleton } from './devices-skeleton'

export function DevicesView({
  paramsPromise,
}: {
  paramsPromise: Promise<DeviceListParams>
}) {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="px-8 h-16 flex items-center">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Devices</h1>
            <p className="text-xs text-subtle mt-0.5">Physical device inventory</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<DevicesResultsSkeleton />}>
        <DevicesResults paramsPromise={paramsPromise} />
      </Suspense>
    </div>
  )
}
