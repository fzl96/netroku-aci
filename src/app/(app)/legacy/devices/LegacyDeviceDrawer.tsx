'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { LegacyDeviceRow } from './LegacyDevicesClient'

function display(value: string | null): string {
  return value || 'Not reported'
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never collected'
}

export function LegacyDeviceDrawer({
  device,
  onClose,
}: {
  device: LegacyDeviceRow | null
  onClose: () => void
}) {
  const details = device ? [
    ['Site', device.site],
    ['Management IP', device.managementIp],
    ['Device type', device.deviceType],
    ['Vendor', display(device.vendor)],
    ['Model', display(device.model)],
    ['Serial number', display(device.serialNumber)],
    ['Software version', display(device.softwareVersion)],
    ['Location', display(device.location)],
    ['First seen', date(device.firstSeenAt)],
    ['Last seen', date(device.lastSeenAt)],
    ['Health collected', date(device.lastHealthSyncAt)],
    ['Interfaces collected', date(device.lastInterfaceSyncAt)],
    ['Endpoints collected', date(device.lastEndpointSyncAt)],
  ] : []

  return (
    <Sheet open={Boolean(device)} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="w-full overflow-y-auto data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="font-serif">{device?.hostname ?? 'Device details'}</SheetTitle>
          <SheetDescription>Collected legacy inventory and feature freshness</SheetDescription>
        </SheetHeader>
        <dl className="divide-y divide-border px-4">
          {details.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[130px_1fr] gap-4 py-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{label}</dt>
              <dd className="break-words text-xs text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </SheetContent>
    </Sheet>
  )
}
