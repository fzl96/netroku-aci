import type { Metadata } from 'next'
import { LegacyDevicesView } from '@/components/legacy/devices/devices-view'
import { parseLegacyDevicePageParams } from '@/lib/legacy/devices/params'

export const metadata: Metadata = {
  title: 'Legacy Devices',
  description: 'Legacy network-device inventory and collection freshness.',
}

export default function Page({ searchParams }: PageProps<'/legacy/devices'>) {
  return <LegacyDevicesView paramsPromise={searchParams.then(parseLegacyDevicePageParams)} />
}
