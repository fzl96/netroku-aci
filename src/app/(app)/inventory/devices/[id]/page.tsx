import { Suspense } from 'react'
import type { Metadata } from 'next'
import { DeviceDetailSkeleton } from '@/components/inventory/devices/devices-skeleton'
import { DeviceDetailShell } from '@/components/inventory/devices/device-detail-shell'

export const metadata: Metadata = {
  title: 'Device',
}

export default function Page({ params }: PageProps<'/inventory/devices/[id]'>) {
  return (
    <Suspense fallback={<DeviceDetailSkeleton />}>
      <DeviceDetailShell idPromise={params.then((p) => p.id)} />
    </Suspense>
  )
}
