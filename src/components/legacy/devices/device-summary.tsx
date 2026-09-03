import { IconDeviceDesktop, IconMapPin, IconSearch, IconServer2 } from '@tabler/icons-react'
import { LegacyDeviceReadError, getLegacyDeviceSummary } from '@/lib/legacy/devices/query'
import { LegacyDeviceRegionError } from './device-region-error'

export async function LegacyDeviceSummary() {
  let summary: Awaited<ReturnType<typeof getLegacyDeviceSummary>>
  try {
    summary = await getLegacyDeviceSummary()
  } catch (error) {
    if (!(error instanceof LegacyDeviceReadError)) throw error
    console.error('[legacy-devices] failed to load summary', error)
    return <LegacyDeviceRegionError region="summary" />
  }

  const cards = [
    ['Devices', summary.total, IconServer2],
    ['Sites', summary.sites, IconMapPin],
    ['With health', summary.withHealth, IconDeviceDesktop],
    ['Missing data', summary.incomplete, IconSearch],
  ] as const

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value, Icon]) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between text-subtle">
            <span className="text-[11px] font-semibold tracking-wide uppercase">{label}</span>
            <Icon size={15} />
          </div>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
        </div>
      ))}
    </div>
  )
}
