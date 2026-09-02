import { Suspense } from 'react'
import type { Metadata } from 'next'
import { DeviceDetailSkeleton } from '@/components/inventory/devices/devices-skeleton'
import { DeviceDetailView } from '@/components/inventory/devices/device-detail-view'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getDeviceById } from '@/lib/inventory/devices/query'

export async function generateMetadata({
  params,
}: PageProps<'/inventory/devices/[id]'>): Promise<Metadata> {
  const { id } = await params
  try {
    const device = await getDeviceById(id)
    return { title: device?.name ?? 'Device' }
  } catch (error) {
    if (error instanceof InventoryReadError) return { title: 'Device' }
    throw error
  }
}

export default function Page({ params }: PageProps<'/inventory/devices/[id]'>) {
  return (
    <Suspense fallback={<DeviceDetailSkeleton />}>
      <DeviceDetailView idPromise={params.then(p => p.id)} />
    </Suspense>
  )
}
