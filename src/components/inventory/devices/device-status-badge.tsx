import type { DeviceStatus } from '@prisma/client'

// A dot and a word rather than a filled pill: in a list where nearly every row
// is Active, a column of green pills drowns out the rows that are not.
const STATUS_STYLE: Record<DeviceStatus, { label: string; dot: string }> = {
  ACTIVE: { label: 'Active', dot: 'bg-green-600 dark:bg-green-400' },
  PLANNED: { label: 'Planned', dot: 'bg-blue-600 dark:bg-blue-400' },
  MAINTENANCE: { label: 'Maintenance', dot: 'bg-yellow-500 dark:bg-yellow-400' },
  RETIRED: { label: 'Retired', dot: 'bg-faint' },
}

export function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const style = STATUS_STYLE[status]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-foreground">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      {style.label}
    </span>
  )
}
