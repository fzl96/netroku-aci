'use client'

import { FormEvent, useState } from 'react'
import { IconHeartbeat, IconSearch } from '@tabler/icons-react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataCard, DataCardBody, DataCardHeader, DataCardRow, DataCardTitle } from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/LegacyEmptyState'
import { LegacyPageShell } from '@/components/legacy/LegacyPageShell'
import { LegacyPagination } from '@/components/legacy/LegacyPagination'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import type { LegacyPageSize } from '@/lib/legacy-ui/query'
import { legacyStatusText } from '@/lib/legacy-ui/health'
import { LegacyHealthDrawer } from './LegacyHealthDrawer'

export interface LegacyHealthRow {
  deviceId: string
  hostname: string
  site: string
  managementIp: string
  sample: {
    id: string; collectedAt: string; uptime: string
    cpuPercent: number | null; memoryPercent: number | null; storagePercent: number | null
    temperatureCelsius: number | null; fanStatuses: string[]; psuStatuses: string[]
  }
}

function metric(value: number | null, suffix = '%') { return value === null ? '—' : `${value.toFixed(1)}${suffix}` }

export function LegacyHealthClient({ rows, total, page, pageSize, query, site, sort, dir, siteOptions, summaries }: { rows: LegacyHealthRow[]; total: number; page: number; pageSize: LegacyPageSize; query: string; site: string; sort: string; dir: 'asc' | 'desc'; siteOptions: string[]; summaries: { devices: number; samples: number; logs: number; latest: string | null } }) {
  const router = useRouter(); const pathname = usePathname(); const searchParams = useSearchParams()
  const [search, setSearch] = useState(query); const [selected, setSelected] = useState<LegacyHealthRow | null>(null)
  function apply(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); const params = new URLSearchParams(searchParams.toString()); for (const key of ['query', 'site', 'sort', 'dir']) { const value = String(form.get(key) ?? '').trim(); const isDefault = (key === 'sort' && value === 'collected') || (key === 'dir' && value === 'desc'); if (value && !isDefault) params.set(key, value); else params.delete(key) } params.set('page', '1'); router.push(`${pathname}?${params}`) }
  const summary = [['Monitored devices', summaries.devices], ['Health samples', summaries.samples], ['Collected logs', summaries.logs], ['Latest collection', summaries.latest ? new Date(summaries.latest).toLocaleString() : 'Never']] as const
  return <LegacyPageShell title="Legacy Health" description="Latest device health, historical measurements, and collected logs">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summary.map(([label, value]) => <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-sm"><p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p><p className="mt-2 text-xl font-semibold text-foreground">{value}</p></div>)}</div>
    <form onSubmit={apply} className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1 sm:max-w-xs"><IconSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input name="query" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search device or site…" className={SEARCH_INPUT_CLS} /></div><select name="site" defaultValue={site} className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs"><option value="">All sites</option>{siteOptions.map(value => <option key={value}>{value}</option>)}</select><select name="sort" defaultValue={sort} aria-label="Sort health" className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs"><option value="collected">Collected time</option><option value="hostname">Hostname</option><option value="site">Site</option><option value="managementIp">Management IP</option></select><select name="dir" defaultValue={dir} aria-label="Sort direction" className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs"><option value="desc">Descending</option><option value="asc">Ascending</option></select><button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">Apply</button></form>
    {rows.length === 0 ? <LegacyEmptyState icon={<IconHeartbeat size={24} />} title="No legacy health samples" description="Run legacy_sync.py monitor or all to collect health measurements and logs." /> : <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"><div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block"><table className="w-full text-xs"><thead><tr>{['Device', 'Site', 'Uptime', 'CPU', 'Memory', 'Storage', 'Temperature', 'Fans', 'PSUs', 'Collected'].map(value => <th key={value} className={DENSE_TABLE_HEAD_CLS}>{value}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.deviceId} onClick={() => setSelected(row)} className="cursor-pointer border-b border-border/70 hover:bg-muted/60"><td className="px-4 py-3 font-semibold">{row.hostname}<div className="font-mono text-[10px] font-normal text-faint">{row.managementIp}</div></td><td className="px-4 py-3 text-subtle">{row.site}</td><td className="px-4 py-3 text-subtle">{row.sample.uptime || '—'}</td><td className="px-4 py-3">{metric(row.sample.cpuPercent)}</td><td className="px-4 py-3">{metric(row.sample.memoryPercent)}</td><td className="px-4 py-3">{metric(row.sample.storagePercent)}</td><td className="px-4 py-3">{metric(row.sample.temperatureCelsius, '°C')}</td><td className="px-4 py-3">{legacyStatusText(row.sample.fanStatuses)}</td><td className="px-4 py-3">{legacyStatusText(row.sample.psuStatuses)}</td><td className="whitespace-nowrap px-4 py-3 text-subtle">{new Date(row.sample.collectedAt).toLocaleString()}</td></tr>)}</tbody></table></div><div className="space-y-2 p-3 md:hidden">{rows.map(row => <DataCard key={row.deviceId} onClick={() => setSelected(row)}><DataCardHeader trailing={<span className="text-[10px] text-faint">{row.site}</span>}><DataCardTitle>{row.hostname}</DataCardTitle></DataCardHeader><DataCardBody><DataCardRow label="CPU / Memory" value={`${metric(row.sample.cpuPercent)} / ${metric(row.sample.memoryPercent)}`} /><DataCardRow label="Temperature" value={metric(row.sample.temperatureCelsius, '°C')} /><DataCardRow label="Collected" value={new Date(row.sample.collectedAt).toLocaleString()} /></DataCardBody></DataCard>)}</div><LegacyPagination page={page} pageSize={pageSize} total={total} /></div>}
    <LegacyHealthDrawer selected={selected} onClose={() => setSelected(null)} />
  </LegacyPageShell>
}
