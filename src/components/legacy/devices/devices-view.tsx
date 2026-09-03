import { Suspense } from 'react'
import { LegacyPageShell } from '@/components/legacy/legacy-page-shell'
import type { LegacyDevicePageParams } from '@/lib/legacy/devices/params'
import { LegacyDeviceFilters } from './device-filters'
import { LegacyDeviceResults } from './device-results'
import { LegacyDeviceSummary } from './device-summary'
import {
  LegacyDeviceFiltersSkeleton,
  LegacyDeviceResultsSkeleton,
  LegacyDeviceSummarySkeleton,
} from './devices-skeleton'

export function LegacyDevicesView({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyDevicePageParams>
}) {
  return (
    <LegacyPageShell
      title="Legacy Devices"
      description="Inventory and collection freshness from legacy network devices"
    >
      <Suspense fallback={<LegacyDeviceSummarySkeleton />}>
        <LegacyDeviceSummary />
      </Suspense>
      <Suspense fallback={<LegacyDeviceFiltersSkeleton />}>
        <LegacyDeviceFilters paramsPromise={paramsPromise} />
      </Suspense>
      <Suspense fallback={<LegacyDeviceResultsSkeleton />}>
        <LegacyDeviceResults paramsPromise={paramsPromise} />
      </Suspense>
    </LegacyPageShell>
  )
}
