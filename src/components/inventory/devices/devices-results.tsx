import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import type { DeviceListParams } from '@/lib/inventory/devices/params'
import { getDevices, getDeviceStacks } from '@/lib/inventory/devices/query'
import { DevicesRegionError } from './devices-region-error'
import { DevicesTableClient } from './devices-table-client'

export async function DevicesResults({
  paramsPromise,
}: {
  paramsPromise: Promise<DeviceListParams>
}) {
  const params = await paramsPromise
  let role: 'admin' | 'member'
  let page: Awaited<ReturnType<typeof getDevices>>
  let stacks: Awaited<ReturnType<typeof getDeviceStacks>>
  try {
    ;[role, page, stacks] = await Promise.all([
      getInventoryViewerRole(),
      getDevices(params),
      getDeviceStacks(),
    ])
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    console.error('[inventory] failed to load devices', error)
    return <DevicesRegionError />
  }

  return (
    <DevicesTableClient
      initialDevices={page.devices}
      existingStacks={stacks}
      total={page.total}
      page={page.page}
      query={params.query}
      role={role}
    />
  )
}
