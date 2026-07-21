'use client'

import { type FormEvent, useState } from 'react'
import { IconPlugConnected, IconSearch } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPageShell } from '@/components/legacy/LegacyPageShell'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import type { LegacyInterfacePresence } from '@/lib/legacy-ui/interfaces'
import type { LegacyPageSize } from '@/lib/legacy-ui/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import { LegacyInterfaceDrawer } from './LegacyInterfaceDrawer'

export interface LegacyInterfaceSampleRow {
  id: string
  collectedAt: string
  adminSt: string
  operSt: string
  speed: string
  inputErrors: string
  outputErrors: string
  crcErrors: string
  dInputErrors: string | null
  dOutputErrors: string | null
  dCrcErrors: string | null
}

export interface LegacyInterfaceRow {
  id: string
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  ifName: string
  description: string
  ipAddress: string | null
  prefixLength: number | null
  mtu: number | null
  speed: string
  adminSt: string
  operSt: string
  present: boolean
  firstSeenAt: string
  lastSeenAt: string
  sample: LegacyInterfaceSampleRow | null
}

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground'

function stateBadge(value: string, present = true) {
  const normalized = value.toLowerCase()
  const tone = !present
    ? 'border-border bg-muted text-faint'
    : normalized === 'up'
      ? 'border-success/30 bg-success/10 text-success'
      : normalized === 'down'
        ? 'border-error/30 bg-error/10 text-error'
        : 'border-warning/30 bg-warning/10 text-warning'
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>{value || 'Unknown'}</span>
}

function exactCounter(value: string | null): string {
  if (value === null) return '—'
  try { return BigInt(value).toLocaleString() } catch { return value }
}

export function LegacyInterfacesClient({
  rows, total, page, pageSize, filters, options, summaries,
}: {
  rows: LegacyInterfaceRow[]
  total: number
  page: number
  pageSize: LegacyPageSize
  filters: { query: string; site: string; device: string; admin: string; oper: string; presence: LegacyInterfacePresence; counter: 'raw' | 'delta'; sort: string; dir: 'asc' | 'desc' }
  options: {
    sites: string[]
    devices: Array<{ id: string; hostname: string; site: string }>
    adminStates: string[]
    operStates: string[]
  }
  summaries: { total: number; down: number; absent: number; withHistory: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(filters.query)
  const [selected, setSelected] = useState<LegacyInterfaceRow | null>(null)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const params = new URLSearchParams(searchParams.toString())
    for (const key of ['query', 'site', 'device', 'admin', 'oper', 'presence', 'counter', 'sort', 'dir']) {
      const value = String(form.get(key) ?? '').trim()
      const isDefault = (key === 'presence' && value === 'present') || (key === 'counter' && value === 'raw') || (key === 'sort' && value === 'lastSeen') || (key === 'dir' && value === 'desc')
      if (value && !isDefault) params.set(key, value)
      else params.delete(key)
    }
    params.set('page', '1')
    router.push(`${pathname}?${params.toString()}`)
  }

  const summary = [
    ['Interfaces', summaries.total],
    ['Operational down', summaries.down],
    ['No longer present', summaries.absent],
    ['With history', summaries.withHistory],
  ] as const

  return <LegacyPageShell title="Legacy Interfaces" description="Current interface inventory, exact counters, and historical trends">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {summary.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{value}</p></div>)}
    </div>

    <form onSubmit={apply} className="flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-xs"><IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input name="query" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search interface or device…" className={SEARCH_INPUT_CLS} /></div>
      <select name="site" defaultValue={filters.site} className={SELECT_CLS}><option value="">All sites</option>{options.sites.map(value => <option key={value}>{value}</option>)}</select>
      <select name="device" defaultValue={filters.device} className={SELECT_CLS}><option value="">All devices</option>{options.devices.map(device => <option key={device.id} value={device.id}>{device.hostname} · {device.site}</option>)}</select>
      <select name="admin" defaultValue={filters.admin} className={SELECT_CLS}><option value="">Any admin state</option>{options.adminStates.map(value => <option key={value}>{value}</option>)}</select>
      <select name="oper" defaultValue={filters.oper} className={SELECT_CLS}><option value="">Any oper state</option>{options.operStates.map(value => <option key={value}>{value}</option>)}</select>
      <select name="presence" defaultValue={filters.presence} className={SELECT_CLS}><option value="present">Present</option><option value="absent">Absent</option><option value="all">All</option></select>
      <select name="counter" defaultValue={filters.counter} aria-label="Counter display" className={SELECT_CLS}><option value="raw">Raw counters</option><option value="delta">Counter deltas</option></select>
      <select name="sort" defaultValue={filters.sort} aria-label="Sort interfaces" className={SELECT_CLS}><option value="lastSeen">Last seen</option><option value="ifName">Interface</option><option value="admin">Admin state</option><option value="oper">Oper state</option><option value="speed">Speed</option></select>
      <select name="dir" defaultValue={filters.dir} aria-label="Sort direction" className={SELECT_CLS}><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Apply</button>
    </form>

    {rows.length === 0 ? <LegacyEmptyState icon={<IconPlugConnected size={24} />} title="No legacy interfaces found" description="Run legacy_sync.py monitor or all to collect interfaces, or clear the current filters." /> : <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block"><table className="w-full text-xs"><thead><tr>{['Device', 'Interface', 'Description', 'IP address', 'Admin', 'Operational', 'Speed', filters.counter === 'raw' ? 'Input errors' : 'Δ input', filters.counter === 'raw' ? 'Output errors' : 'Δ output', filters.counter === 'raw' ? 'CRC errors' : 'Δ CRC', 'Collected'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} onClick={() => setSelected(row)} className="cursor-pointer border-b border-border/70 hover:bg-muted/60"><td className="px-4 py-3 font-semibold text-foreground">{row.hostname}<div className="text-[10px] font-normal text-faint">{row.site}</div></td><td className="whitespace-nowrap px-4 py-3 font-mono text-foreground">{row.ifName}{!row.present && <div className="font-sans text-[10px] text-faint">Absent</div>}</td><td className="max-w-52 truncate px-4 py-3 text-subtle">{row.description || '—'}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.ipAddress ? `${row.ipAddress}${row.prefixLength === null ? '' : `/${row.prefixLength}`}` : '—'}</td><td className="px-4 py-3">{stateBadge(row.adminSt, row.present)}</td><td className="px-4 py-3">{stateBadge(row.operSt, row.present)}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.sample?.speed || row.speed || '—'}</td><td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(filters.counter === 'raw' ? row.sample?.inputErrors ?? null : row.sample?.dInputErrors ?? null)}</td><td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(filters.counter === 'raw' ? row.sample?.outputErrors ?? null : row.sample?.dOutputErrors ?? null)}</td><td className="px-4 py-3 text-right font-mono text-subtle">{exactCounter(filters.counter === 'raw' ? row.sample?.crcErrors ?? null : row.sample?.dCrcErrors ?? null)}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.sample ? new Date(row.sample.collectedAt).toLocaleString() : 'No samples'}</td></tr>)}</tbody></table></div>
      <div className="space-y-2 p-3 md:hidden">{rows.map(row => <DataCard key={row.id} onClick={() => setSelected(row)}><DataCardHeader trailing={stateBadge(row.operSt, row.present)}><DataCardTitle>{row.hostname} · {row.ifName}</DataCardTitle></DataCardHeader><DataCardBody><DataCardRow label="Site" value={row.site} /><DataCardRow label="Description" value={row.description || 'Not reported'} /><DataCardRow label={`${filters.counter === 'raw' ? 'Errors' : 'Error deltas'} (in / out / CRC)`} value={`${exactCounter(filters.counter === 'raw' ? row.sample?.inputErrors ?? null : row.sample?.dInputErrors ?? null)} / ${exactCounter(filters.counter === 'raw' ? row.sample?.outputErrors ?? null : row.sample?.dOutputErrors ?? null)} / ${exactCounter(filters.counter === 'raw' ? row.sample?.crcErrors ?? null : row.sample?.dCrcErrors ?? null)}`} /></DataCardBody></DataCard>)}</div>
      <LegacyPagination page={page} pageSize={pageSize} total={total} />
    </div>}
    <LegacyInterfaceDrawer key={selected?.id ?? 'closed'} selected={selected} onClose={() => setSelected(null)} />
  </LegacyPageShell>
}
