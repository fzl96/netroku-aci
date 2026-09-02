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
    <Suspense fallback={<DevicesResultsSkeleton />}>
      <DevicesResults paramsPromise={paramsPromise} />
    </Suspense>
  )
}
