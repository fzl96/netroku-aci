import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getDevices, getDeviceStacks } from '@/actions/inventory/devices'
import { parseDeviceListParams } from '@/lib/inventory/device-query'
import { DevicesClient } from './DevicesClient'

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Physical device inventory across all sites and racks.',
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const params = parseDeviceListParams(await searchParams)
  const [{ devices, total, page }, stacks] = await Promise.all([
    getDevices(params),
    getDeviceStacks(),
  ])
  const role = session.user.role === 'admin' ? 'admin' : 'member'

  return (
    <DevicesClient
      initialDevices={devices}
      existingStacks={stacks}
      total={total}
      page={page}
      query={params.query}
      role={role}
    />
  )
}
