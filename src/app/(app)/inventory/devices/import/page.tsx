import { getSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { DeviceImportClient } from './DeviceImportClient'

export const metadata = {
  title: 'Import Devices · Netroku ACI',
}

export default async function DeviceImportPage() {
  const session = await getSession()
  if (!session) redirect('/login')

  const role = (session.user.role as 'admin' | 'member') ?? 'member'
  if (role !== 'admin') redirect('/inventory/devices')

  return <DeviceImportClient />
}
