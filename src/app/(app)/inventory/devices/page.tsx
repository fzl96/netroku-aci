import type { Metadata } from 'next'
import { DevicesView } from '@/components/inventory/devices/devices-view'
import { parseDeviceListParams } from '@/lib/inventory/devices/params'

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Physical device inventory across all sites and racks.',
}

export default function Page({ searchParams }: PageProps<'/inventory/devices'>) {
  return <DevicesView paramsPromise={searchParams.then(parseDeviceListParams)} />
}
