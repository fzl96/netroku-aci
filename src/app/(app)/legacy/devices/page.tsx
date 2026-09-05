import type { Metadata } from 'next'
import { LegacyDevicesShell } from '@/components/legacy/devices/devices-shell'
import { parseLegacyDevicePageParams } from '@/lib/legacy/devices/params'

export const metadata: Metadata = {
  title: 'Legacy Devices',
  description: 'Legacy network-device inventory and collection freshness.',
}

export default function Page({ searchParams }: PageProps<'/legacy/devices'>) {
  return <LegacyDevicesShell paramsPromise={searchParams.then(parseLegacyDevicePageParams)} />
}
