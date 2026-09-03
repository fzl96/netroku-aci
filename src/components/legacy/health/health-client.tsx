'use client'

import { FormEvent, useState } from 'react'
import { IconHeartbeat, IconSearch } from '@tabler/icons-react'
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
import { legacyStatusText } from '@/lib/legacy/health/filters'
import {
  buildLegacyHealthPageUrl,
  LEGACY_HEALTH_SORTS,
  type LegacyHealthPageParams,
  type LegacyHealthSort,
} from '@/lib/legacy/health/params'
import type { LegacyHealthResults, LegacyHealthRow } from '@/lib/legacy/health/query'
import { LegacyHealthDrawer } from './health-drawer'

const SELECT_CLS = 'rounded-lg border border-border bg-muted px-3 py-1.5 text-xs'

const SORT_LABELS: Record<LegacyHealthSort, string> = {
  collected: 'Collected time',
  hostname: 'Hostname',
  site: 'Site',
  managementIp: 'Management IP',
}

function metric(value: number | null, suffix = '%') {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`
}

export function LegacyHealthFiltersClient({
  params,
  siteOptions,
}: {
  params: LegacyHealthPageParams
  siteOptions: string[]
}) {
  const router = useRouter()
  const [search, setSearch] = useState(params.query)

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const read = (key: string) => String(form.get(key) ?? '').trim()
    router.push(
      buildLegacyHealthPageUrl({
        ...params,
        query: read('query'),
        site: read('site'),
        sort: (LEGACY_HEALTH_SORTS as readonly string[]).includes(read('sort'))
          ? (read('sort') as LegacyHealthSort)
          : 'collected',
        direction: read('dir') === 'asc' ? 'asc' : 'desc',
        page: 1,
      }),
    )
  }

  return (
    <form onSubmit={apply} className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1 sm:max-w-xs">
        <IconSearch size={13} className="absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
        <input
          name="query"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search device or site…"
          className={SEARCH_INPUT_CLS}
        />
      </div>
      <select
        name="site"
        defaultValue={params.site}
        aria-label="Filter by site"
        className={SELECT_CLS}
      >
        <option value="">All sites</option>
        {siteOptions.map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <select
        name="sort"
        defaultValue={params.sort}
        aria-label="Sort health"
        className={SELECT_CLS}
      >
        {LEGACY_HEALTH_SORTS.map((value) => (
          <option key={value} value={value}>
            {SORT_LABELS[value]}
          </option>
        ))}
      </select>
      <select
        name="dir"
        defaultValue={params.direction}
        aria-label="Sort direction"
        className={SELECT_CLS}
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

export function LegacyHealthResultsClient({ results }: { results: LegacyHealthResults }) {
  const [selected, setSelected] = useState<LegacyHealthRow | null>(null)
  const { rows, page, pageSize, total } = results

  if (rows.length === 0) {
    return (
      <LegacyEmptyState
        icon={<IconHeartbeat size={24} />}
        title="No legacy health samples"
        description="Run legacy_sync.py monitor or all to collect health measurements and logs."
      />
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {[
                  'Device',
                  'Site',
                  'Uptime',
                  'CPU',
                  'Memory',
                  'Storage',
                  'Temperature',
                  'Fans',
                  'PSUs',
                  'Collected',
                ].map((value) => (
                  <th key={value} className={DENSE_TABLE_HEAD_CLS}>
                    {value}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.deviceId}
                  onClick={() => setSelected(row)}
                  className="cursor-pointer border-b border-border/70 hover:bg-muted/60"
                >
                  <td className="px-4 py-3 font-semibold">
                    {row.hostname}
                    <div className="font-mono text-[10px] font-normal text-faint">
                      {row.managementIp}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-subtle">{row.site}</td>
                  <td className="px-4 py-3 text-subtle">{row.sample.uptime || '—'}</td>
                  <td className="px-4 py-3">{metric(row.sample.cpuPercent)}</td>
                  <td className="px-4 py-3">{metric(row.sample.memoryPercent)}</td>
                  <td className="px-4 py-3">{metric(row.sample.storagePercent)}</td>
                  <td className="px-4 py-3">{metric(row.sample.temperatureCelsius, '°C')}</td>
                  <td className="px-4 py-3">{legacyStatusText(row.sample.fanStatuses)}</td>
                  <td className="px-4 py-3">{legacyStatusText(row.sample.psuStatuses)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-subtle">
                    {new Date(row.sample.collectedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-2 p-3 md:hidden">
          {rows.map((row) => (
            <DataCard key={row.deviceId} onClick={() => setSelected(row)}>
              <DataCardHeader trailing={<span className="text-[10px] text-faint">{row.site}</span>}>
                <DataCardTitle>{row.hostname}</DataCardTitle>
              </DataCardHeader>
              <DataCardBody>
                <DataCardRow
                  label="CPU / Memory"
                  value={`${metric(row.sample.cpuPercent)} / ${metric(row.sample.memoryPercent)}`}
                />
                <DataCardRow
                  label="Temperature"
                  value={metric(row.sample.temperatureCelsius, '°C')}
                />
                <DataCardRow
                  label="Collected"
                  value={new Date(row.sample.collectedAt).toLocaleString()}
                />
              </DataCardBody>
            </DataCard>
          ))}
        </div>
        <LegacyPagination page={page} pageSize={pageSize} total={total} />
      </div>
      <LegacyHealthDrawer selected={selected} onClose={() => setSelected(null)} />
    </>
  )
}
