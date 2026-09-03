'use client'

import { FormEvent, useState } from 'react'
import { IconSearch, IconServer2 } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/legacy-empty-state'
import { LegacyPagination } from '@/components/legacy/legacy-pagination'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS } from '@/lib/ui-classes'
import {
  buildLegacyDevicePageUrl,
  LEGACY_DEVICE_SORTS,
  type LegacyDevicePageParams,
  type LegacyDeviceSort,
} from '@/lib/legacy/devices/params'
import type { LegacyDeviceResults, LegacyDeviceRow } from '@/lib/legacy/devices/query'
import { LegacyDeviceDrawer } from './device-drawer'

const SORT_LABELS: Record<LegacyDeviceSort, string> = {
  lastSeenAt: 'Last seen',
  hostname: 'Hostname',
  site: 'Site',
  managementIp: 'Management IP',
  model: 'Model',
}

function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : 'Never'
}

export function LegacyDeviceFiltersClient({
  params,
  siteOptions,
  typeOptions,
}: {
  params: LegacyDevicePageParams
  siteOptions: string[]
  typeOptions: string[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    router.push(
      buildLegacyDevicePageUrl({
        ...params,
        query: read('query'),
        site: read('site'),
        deviceType: read('deviceType'),
        sort: (LEGACY_DEVICE_SORTS as readonly string[]).includes(read('sort'))
          ? (read('sort') as LegacyDeviceSort)
          : 'lastSeenAt',
        direction: read('dir') === 'asc' ? 'asc' : 'desc',
        page: 1,
      }),
    )
  }

  return (
    <form onSubmit={applyFilters} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <IconSearch
          size={13}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint"
        />
        <input
          name="query"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search device inventory…"
          className={SEARCH_INPUT_CLS}
        />
      </div>
      <select
        name="site"
        defaultValue={params.site}
        aria-label="Filter by site"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="">All sites</option>
        {siteOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        name="deviceType"
        defaultValue={params.deviceType}
        aria-label="Filter by device type"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="">All device types</option>
        {typeOptions.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <select
        name="sort"
        defaultValue={params.sort}
        aria-label="Sort devices"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        {LEGACY_DEVICE_SORTS.map((value) => (
          <option key={value} value={value}>
            {SORT_LABELS[value]}
          </option>
        ))}
      </select>
      <select
        name="dir"
        defaultValue={params.direction}
        aria-label="Sort direction"
        className="rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-foreground"
      >
        <option value="desc">Descending</option>
        <option value="asc">Ascending</option>
      </select>
      <button className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground">
        Apply
      </button>
    </form>
  )
}

export function LegacyDeviceResultsClient({ results }: { results: LegacyDeviceResults }) {
  const [selected, setSelected] = useState<LegacyDeviceRow | null>(null)
  const { rows, page, pageSize, total } = results

  if (rows.length === 0) {
    return (
      <LegacyEmptyState
        icon={<IconServer2 size={24} />}
        title="No legacy devices found"
        description="Run legacy_sync.py monitor, endpoint, or all to register devices, or clear the current filters."
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                {[
                  'Hostname',
                  'Site',
                  'Management IP',
                  'Platform',
                  'Model / Serial',
                  'Software',
                  'Last seen',
                  'Health',
                  'Interfaces',
                  'Endpoints',
                ].map((label) => (
                  <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-border/70 hover:bg-muted/60"
                >
                  <td className="px-4 py-3 font-semibold text-foreground">{row.hostname}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.site}</td>
                  <td className="px-4 py-3 font-mono text-muted-foreground">{row.managementIp}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.vendor || '—'} · {row.deviceType}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{row.model || '—'}</div>
                    <div className="text-[10px] text-faint">{row.serialNumber || 'No serial'}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.softwareVersion || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {shortDate(row.lastSeenAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {shortDate(row.lastHealthSyncAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {shortDate(row.lastInterfaceSyncAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    {shortDate(row.lastEndpointSyncAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 p-3 md:hidden">
          {rows.map((row) => (
            <DataCard key={row.id} onClick={() => setSelected(row)}>
              <DataCardHeader trailing={<span className="text-[10px] text-faint">{row.site}</span>}>
                <DataCardTitle>{row.hostname}</DataCardTitle>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow label="IP" value={row.managementIp} />
                <DataCardRow label="Model" value={row.model || 'Not reported'} />
                <DataCardRow label="Last seen" value={shortDate(row.lastSeenAt)} />
              </DataCardBody>
            </DataCard>
          ))}
        </div>
        <LegacyPagination page={page} pageSize={pageSize} total={total} />
      </div>
      <LegacyDeviceDrawer device={selected} onClose={() => setSelected(null)} />
    </>
  )
}
