'use client'

import { type FormEvent, useState } from 'react'
import { IconDevices, IconSearch } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPageShell } from '@/components/legacy/LegacyPageShell'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import type { LegacyPageSize } from '@/lib/legacy-ui/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'

export interface LegacyEndpointRow {
  id: string
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  mac: string
  ip: string | null
  vlan: string
  vlanName: string
  interface: string
  learningType: string
  isActive: boolean
  firstSeenAt: string
  lastSeenAt: string
  clearedAt: string | null
}

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground'

function statusBadge(active: boolean) {
  return active
    ? <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Active</span>
    : <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-subtle">Historical</span>
}

export function LegacyEndpointsClient({ rows, total, page, pageSize, filters, options, summaries }: {
  rows: LegacyEndpointRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
  filters: { query: string; site: string; device: string; vlan: string; interface: string; status: 'active' | 'historical' | 'all'; sort: string; dir: 'asc' | 'desc' }
  options: { sites: string[]; devices: Array<{ id: string; hostname: string; site: string }>; vlans: string[]; interfaces: string[] }
  summaries: { total: number; active: number; historical: number; vlans: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(filters.query)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const params = new URLSearchParams(searchParams.toString())
    for (const key of ['query', 'site', 'device', 'vlan', 'interface', 'status', 'sort', 'dir']) {
      const value = String(form.get(key) ?? '').trim()
      const isDefault = (key === 'status' && value === 'active') || (key === 'sort' && value === 'lastSeen') || (key === 'dir' && value === 'desc')
      if (value && !isDefault) params.set(key, value)
      else params.delete(key)
    }
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  const summary = [['Endpoint records', summaries.total], ['Active', summaries.active], ['Historical', summaries.historical], ['VLANs', summaries.vlans]] as const

  return <LegacyPageShell title="Legacy Endpoints" description="Current endpoint presence and retained placement lifecycle">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>)}</div>
    <form onSubmit={apply} className="flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-xs"><IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input name="query" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search MAC, IP, VLAN, or device…" className={SEARCH_INPUT_CLS} /></div>
      <select name="site" defaultValue={filters.site} className={SELECT_CLS}><option value="">All sites</option>{options.sites.map(value => <option key={value}>{value}</option>)}</select>
      <select name="device" defaultValue={filters.device} className={SELECT_CLS}><option value="">All devices</option>{options.devices.map(device => <option key={device.id} value={device.id}>{device.hostname} · {device.site}</option>)}</select>
      <select name="vlan" defaultValue={filters.vlan} className={SELECT_CLS}><option value="">All VLANs</option>{options.vlans.map(value => <option key={value}>{value}</option>)}</select>
      <select name="interface" defaultValue={filters.interface} className={SELECT_CLS}><option value="">All interfaces</option>{options.interfaces.map(value => <option key={value}>{value}</option>)}</select>
      <select name="status" defaultValue={filters.status} className={SELECT_CLS}><option value="active">Active</option><option value="historical">Historical</option><option value="all">All lifecycle records</option></select>
      <select name="sort" defaultValue={filters.sort} className={SELECT_CLS}><option value="lastSeen">Last seen</option><option value="firstSeen">First seen</option><option value="mac">MAC</option><option value="vlan">VLAN</option><option value="interface">Interface</option><option value="cleared">Cleared time</option></select>
      <select name="dir" defaultValue={filters.dir} aria-label="Sort direction" className={SELECT_CLS}><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Apply</button>
    </form>
    {rows.length === 0 ? <LegacyEmptyState icon={<IconDevices size={24} />} title="No legacy endpoints found" description="Run legacy_sync.py endpoint or all on an endpoint-capable device, or clear the current filters." /> : <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block"><table className="w-full text-xs"><thead><tr>{['Device', 'MAC', 'IP address', 'VLAN', 'Interface', 'Learning', 'Status', 'First seen', 'Last seen', 'Cleared'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/70 hover:bg-muted/60"><td className="px-4 py-3 font-semibold text-foreground">{row.hostname}<div className="text-[10px] font-normal text-faint">{row.site}</div></td><td className="whitespace-nowrap px-4 py-3 font-mono text-foreground">{row.mac}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.ip ?? <span className="font-sans text-faint">Not reported</span>}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.vlan}{row.vlanName && <div className="text-[10px] text-faint">{row.vlanName}</div>}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.interface || '—'}</td><td className="px-4 py-3 text-subtle">{row.learningType || '—'}</td><td className="px-4 py-3">{statusBadge(row.isActive)}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{new Date(row.firstSeenAt).toLocaleString()}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{new Date(row.lastSeenAt).toLocaleString()}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.clearedAt ? new Date(row.clearedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>
      <div className="space-y-2 p-3 md:hidden">{rows.map(row => <DataCard key={row.id}><DataCardHeader trailing={statusBadge(row.isActive)}><DataCardTitle>{row.mac}</DataCardTitle></DataCardHeader><DataCardBody><DataCardRow label="Device" value={`${row.hostname} · ${row.site}`} /><DataCardRow label="IP" value={row.ip || 'Not reported'} /><DataCardRow label="Placement" value={`VLAN ${row.vlan} · ${row.interface || 'Unknown interface'}`} /><DataCardRow label="Last seen" value={new Date(row.lastSeenAt).toLocaleString()} /></DataCardBody></DataCard>)}</div>
      <LegacyPagination page={page} pageSize={pageSize} total={total} />
    </div>}
  </LegacyPageShell>
}
