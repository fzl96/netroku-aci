import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { IconArrowLeft } from '@tabler/icons-react'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { DeviceImportClient } from './device-import-client'
import { DeviceImportContentSkeleton } from './devices-skeleton'

async function DeviceImportContent() {
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

export function DeviceImportView() {
  return (
    <div className="flex-1 space-y-6 p-8 max-w-7xl mx-auto">
      <div className="space-y-1">
        <Link
          href="/inventory/devices"
          className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 text-xs"
        >
          <IconArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Devices</span>
        </Link>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
          Import Devices from CSV
        </h1>
        <p className="text-xs text-subtle">
          Bulk register new hardware, update existing devices via serial number, and assign rack and stack placements.
        </p>
      </div>
      <Suspense fallback={<DeviceImportContentSkeleton />}>
        <DeviceImportContent />
      </Suspense>
    </div>
  )
}
