import type { Metadata } from 'next'
import { DevicesShell } from '@/components/inventory/devices/devices-shell'
import { parseDeviceListParams } from '@/lib/inventory/devices/params'

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Physical device inventory across all sites and racks.',
}

export default function Page({ searchParams }: PageProps<'/inventory/devices'>) {
  return <DevicesShell paramsPromise={searchParams.then(parseDeviceListParams)} />
}
