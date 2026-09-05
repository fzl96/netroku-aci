import { Suspense } from 'react'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import type { DeviceListParams } from '@/lib/inventory/devices/params'
import {
  getDevices,
  getDeviceStacks,
  type DevicesLoadState,
  type DevicesResultsPayload,
} from '@/lib/inventory/devices/query'
import { DevicesResults } from './devices-results'
import { DevicesResultsSkeleton } from './devices-skeleton'

async function loadResults(
  paramsPromise: Promise<DeviceListParams>,
): Promise<DevicesLoadState<DevicesResultsPayload>> {
  const params = await paramsPromise

  try {
    const [role, page, stacks] = await Promise.all([
      getInventoryViewerRole(),
      getDevices(params),
      getDeviceStacks(),
    ])
    return { kind: 'ready', data: { params, role, page, stacks } }
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    console.error('[inventory] failed to load devices', error)
    return { kind: 'unauthorized' }
  }
}

export function DevicesShell({ paramsPromise }: { paramsPromise: Promise<DeviceListParams> }) {
  const resultsPromise = loadResults(paramsPromise)

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
        <DevicesResults dataPromise={resultsPromise} />
      </Suspense>
    </div>
  )
}
