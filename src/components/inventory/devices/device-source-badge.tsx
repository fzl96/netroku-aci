import type { SafeDeviceWithRack } from '@/lib/inventory/devices/query'
import { deviceSourceKind } from '@/lib/inventory/devices/source'

export function DeviceSourceBadge({ device }: { device: SafeDeviceWithRack }) {
  const kind = deviceSourceKind(device)
  const label = kind === 'LEGACY' ? 'Legacy' : kind === 'UNLINKED' ? 'Unlinked' : 'ACI'
  const tone =
    kind === 'ACI'
      ? 'border-primary/20 bg-primary/5 text-primary'
      : kind === 'LEGACY'
        ? 'border-blue-600/20 bg-blue-600/5 text-blue-700 dark:text-blue-400'
        : 'border-border bg-muted text-subtle'
  const title =
    kind === 'UNLINKED'
      ? 'No linked discovery source'
      : device.source
        ? device.source.sourceLabel
        : `Discovery source linked to stack ${device.deviceStack?.name}`

  return (
    <span
      title={title}
      className={`inline-flex rounded border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}
    >
      {label}
    </span>
  )
}
