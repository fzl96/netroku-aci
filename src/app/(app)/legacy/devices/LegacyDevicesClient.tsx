'use client'

import { FormEvent, useState } from 'react'
import { IconDeviceDesktop, IconMapPin, IconSearch, IconServer2 } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPageShell } from '@/components/legacy/LegacyPageShell'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import type { LegacyPageSize } from '@/lib/legacy-ui/query'
import { LegacyDeviceDrawer } from './LegacyDeviceDrawer'

export interface LegacyDeviceRow {
  id: string
  site: string
  hostname: string
  managementIp: string
  deviceType: string
  vendor: string | null
  model: string | null
  serialNumber: string | null
  softwareVersion: string | null
  location: string | null
  active: boolean
  firstSeenAt: string
  lastSeenAt: string
  lastHealthSyncAt: string | null
  lastInterfaceSyncAt: string | null
  lastEndpointSyncAt: string | null
}

function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never'
}

export function LegacyDevicesClient({
  rows,
  total,
  page,
  pageSize,
  query,
  site,
  deviceType,
  siteOptions,
  typeOptions,
  summaries,
}: {
  rows: LegacyDeviceRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
  query: string
  site: string
  deviceType: string
  siteOptions: string[]
  typeOptions: string[]
  summaries: { total: number; sites: number; withHealth: number; incomplete: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(query)
  const [selected, setSelected] = useState<LegacyDeviceRow | null>(null)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const params = new URLSearchParams(searchParams.toString())
    for (const key of ['query', 'site', 'deviceType']) {
      const value = String(form.get(key) ?? '').trim()
      if (value) params.set(key, value)
      else params.delete(key)
    }
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  const cards = [
    ['Devices', summaries.total, IconServer2],
    ['Sites', summaries.sites, IconMapPin],
    ['With health', summaries.withHealth, IconDeviceDesktop],
    ['Missing data', summaries.incomplete, IconSearch],
  ] as const

  return (
    <LegacyPageShell title="Legacy Devices" description="Inventory and collection freshness from legacy network devices">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-subtle"><span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span><Icon size={15} /></div>
            <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <form onSubmit={applyFilters} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input name="query" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search device inventory…" className={SEARCH_INPUT_CLS} />
        </div>
        <select name="site" defaultValue={site} className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground">
          <option value="">All sites</option>
          {siteOptions.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <select name="deviceType" defaultValue={deviceType} className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground">
          <option value="">All device types</option>
          {typeOptions.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Apply</button>
      </form>

      {rows.length === 0 ? (
        <LegacyEmptyState icon={<IconServer2 size={24} />} title="No legacy devices found" description="Run legacy_sync.py monitor, endpoint, or all to register devices, or clear the current filters." />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block">
            <table className="w-full border-collapse text-xs">
              <thead><tr>{['Hostname', 'Site', 'Management IP', 'Platform', 'Model / Serial', 'Software', 'Last seen', 'Health', 'Interfaces', 'Endpoints'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} onClick={() => setSelected(row)} className="cursor-pointer border-b border-border/70 hover:bg-muted/60">
                    <td className="px-4 py-3 font-semibold text-foreground">{row.hostname}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.site}</td>
                    <td className="px-4 py-3 font-mono text-muted-foreground">{row.managementIp}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.vendor || '—'} · {row.deviceType}</td>
                    <td className="px-4 py-3 text-muted-foreground"><div>{row.model || '—'}</div><div className="text-[10px] text-faint">{row.serialNumber || 'No serial'}</div></td>
                    <td className="px-4 py-3 text-muted-foreground">{row.softwareVersion || '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{shortDate(row.lastSeenAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{shortDate(row.lastHealthSyncAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{shortDate(row.lastInterfaceSyncAt)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{shortDate(row.lastEndpointSyncAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 p-3 md:hidden">
            {rows.map(row => (
              <DataCard key={row.id} onClick={() => setSelected(row)}>
                <DataCardHeader trailing={<span className="text-[10px] text-faint">{row.site}</span>}><DataCardTitle>{row.hostname}</DataCardTitle></DataCardHeader>
                <DataCardBody><DataCardRow label="IP" value={row.managementIp} /><DataCardRow label="Model" value={row.model || 'Not reported'} /><DataCardRow label="Last seen" value={shortDate(row.lastSeenAt)} /></DataCardBody>
              </DataCard>
            ))}
          </div>
          <LegacyPagination page={page} pageSize={pageSize} total={total} />
        </div>
      )}
      <LegacyDeviceDrawer device={selected} onClose={() => setSelected(null)} />
    </LegacyPageShell>
  )
}
