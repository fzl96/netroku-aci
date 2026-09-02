'use client'

import { type FormEvent, useState } from 'react'
import { IconDevices, IconSearch } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyEndpointPageUrl,
  LEGACY_ENDPOINT_SORTS,
  type LegacyEndpointPageParams,
  type LegacyEndpointSort,
  type LegacyEndpointStatusFilter,
} from '@/lib/legacy/endpoints/params'
import type {
  LegacyEndpointFilterOptions,
  LegacyEndpointResults,
} from '@/lib/legacy/endpoints/query'

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground'

const SORT_LABELS: Record<LegacyEndpointSort, string> = {
  lastSeen: 'Last seen',
  firstSeen: 'First seen',
  mac: 'MAC',
  vlan: 'VLAN',
  interface: 'Interface',
  cleared: 'Cleared time',
}

function statusBadge(active: boolean) {
  return active
    ? <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">Active</span>
    : <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-subtle">Historical</span>
}

export function LegacyMac({ mac, macFlag }: { mac: string; macFlag: string }) {
  return <>{macFlag ? `${macFlag} ${mac}` : mac}</>
}

export function LegacyEndpointFiltersClient({
  params,
  options,
}: {
  params: LegacyEndpointPageParams
  options: LegacyEndpointFilterOptions
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    const status = read('status')
    router.push(buildLegacyEndpointPageUrl({
      ...params,
      query: read('query'),
      site: read('site'),
      device: read('device'),
      vlan: read('vlan'),
      interface: read('interface'),
      status: status === 'historical' || status === 'all'
        ? status as LegacyEndpointStatusFilter
        : 'active',
      sort: (LEGACY_ENDPOINT_SORTS as readonly string[]).includes(read('sort'))
        ? read('sort') as LegacyEndpointSort
        : 'lastSeen',
      direction: read('dir') === 'asc' ? 'asc' : 'desc',
      page: 1,
    }))
  }

  return (
    <form onSubmit={apply} className="flex flex-wrap gap-2">
      <div className="relative min-w-56 flex-1 sm:max-w-xs">
        <IconSearch size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input name="query" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search MAC, IP, VLAN, or device…" className={SEARCH_INPUT_CLS} />
      </div>
      <select name="site" defaultValue={params.site} aria-label="Filter by site" className={SELECT_CLS}><option value="">All sites</option>{options.sites.map(value => <option key={value}>{value}</option>)}</select>
      <select name="device" defaultValue={params.device} aria-label="Filter by device" className={SELECT_CLS}><option value="">All devices</option>{options.devices.map(device => <option key={device.id} value={device.id}>{device.hostname} · {device.site}</option>)}</select>
      <select name="vlan" defaultValue={params.vlan} aria-label="Filter by VLAN" className={SELECT_CLS}><option value="">All VLANs</option>{options.vlans.map(value => <option key={value}>{value}</option>)}</select>
      <select name="interface" defaultValue={params.interface} aria-label="Filter by interface" className={SELECT_CLS}><option value="">All interfaces</option>{options.interfaces.map(value => <option key={value}>{value}</option>)}</select>
      <select name="status" defaultValue={params.status} aria-label="Filter by lifecycle" className={SELECT_CLS}><option value="active">Active</option><option value="historical">Historical</option><option value="all">All lifecycle records</option></select>
      <select name="sort" defaultValue={params.sort} aria-label="Sort endpoints" className={SELECT_CLS}>{LEGACY_ENDPOINT_SORTS.map(value => <option key={value} value={value}>{SORT_LABELS[value]}</option>)}</select>
      <select name="dir" defaultValue={params.direction} aria-label="Sort direction" className={SELECT_CLS}><option value="desc">Descending</option><option value="asc">Ascending</option></select>
      <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Apply</button>
    </form>
  )
}

export function LegacyEndpointResultsClient({ results }: { results: LegacyEndpointResults }) {
  const { rows, page, pageSize, total } = results

  if (rows.length === 0) {
    return (
      <LegacyEmptyState
        icon={<IconDevices size={24} />}
        title="No legacy endpoints found"
        description="Run legacy_sync.py endpoint or all on an endpoint-capable device, or clear the current filters."
      />
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block"><table className="w-full text-xs"><thead><tr>{['Device', 'MAC', 'IP address', 'VLAN', 'Interface', 'Learning', 'Status', 'First seen', 'Last seen', 'Cleared'].map(label => <th key={label} className={DENSE_TABLE_HEAD_CLS}>{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border/70 hover:bg-muted/60"><td className="px-4 py-3 font-semibold text-foreground">{row.hostname}<div className="text-[10px] font-normal text-faint">{row.site}</div></td><td className="whitespace-nowrap px-4 py-3 font-mono text-foreground"><LegacyMac mac={row.mac} macFlag={row.macFlag} /></td><td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.ip ?? <span className="font-sans text-faint">Not reported</span>}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.vlan}{row.vlanName && <div className="text-[10px] text-faint">{row.vlanName}</div>}</td><td className="whitespace-nowrap px-4 py-3 font-mono text-subtle">{row.interface || '—'}</td><td className="px-4 py-3 text-subtle">{row.learningType || '—'}</td><td className="px-4 py-3">{statusBadge(row.isActive)}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{new Date(row.firstSeenAt).toLocaleString()}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{new Date(row.lastSeenAt).toLocaleString()}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{row.clearedAt ? new Date(row.clearedAt).toLocaleString() : '—'}</td></tr>)}</tbody></table></div>
      <div className="space-y-2 p-3 md:hidden">{rows.map(row => <DataCard key={row.id}><DataCardHeader trailing={statusBadge(row.isActive)}><DataCardTitle><LegacyMac mac={row.mac} macFlag={row.macFlag} /></DataCardTitle></DataCardHeader><DataCardBody><DataCardRow label="Device" value={`${row.hostname} · ${row.site}`} /><DataCardRow label="IP" value={row.ip || 'Not reported'} /><DataCardRow label="Placement" value={`VLAN ${row.vlan} · ${row.interface || 'Unknown interface'}`} /><DataCardRow label="Last seen" value={new Date(row.lastSeenAt).toLocaleString()} /></DataCardBody></DataCard>)}</div>
      <LegacyPagination page={page} pageSize={pageSize} total={total} />
    </div>
  )
}
