import { redirect } from 'next/navigation'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { DeviceImportClient } from './device-import-client'

export async function DeviceImportView() {
  let role: 'admin' | 'member'
  try {
    role = await getInventoryViewerRole()
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    redirect('/signin')
  }
  if (role !== 'admin') redirect('/inventory/devices')

  return <DeviceImportClient />
}
