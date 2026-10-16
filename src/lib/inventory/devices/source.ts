import type { InventorySourceKind } from '@prisma/client'

export type DeviceSourceFilter = InventorySourceKind | 'UNLINKED'

export const DEVICE_SOURCE_OPTIONS = [
  { value: 'ACI', label: 'ACI' },
  { value: 'LEGACY', label: 'Legacy' },
  { value: 'UNLINKED', label: 'Unlinked' },
] satisfies Array<{ value: DeviceSourceFilter; label: string }>

/** A physical device's own link takes precedence over its stack's link. */
export function deviceSourceKind(device: {
  source?: { kind: InventorySourceKind } | null
  deviceStack?: { source?: { kind: InventorySourceKind } | null } | null
}): DeviceSourceFilter {
  return device.source?.kind ?? device.deviceStack?.source?.kind ?? 'UNLINKED'
}
