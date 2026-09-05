'use client'

import { use, useState } from 'react'
import { IconHeartbeat } from '@tabler/icons-react'
import {
  DataCard,
  DataCardBody,
  DataCardHeader,
  DataCardRow,
  DataCardTitle,
} from '@/components/ui/data-card'
import { LegacyEmptyState } from '@/components/legacy/legacy-empty-state'
import { LegacyPagination } from '@/components/legacy/legacy-pagination'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'
import { legacyStatusText } from '@/lib/legacy/health/filters'
import type {
  LegacyHealthLoadState,
  LegacyHealthResults as LegacyHealthResultsData,
  LegacyHealthRow,
} from '@/lib/legacy/health/query'
import { LegacyHealthDrawer } from './health-drawer'
import { LegacyHealthRegionError } from './health-region-error'

function metric(value: number | null, suffix = '%') {
  return value === null ? '—' : `${value.toFixed(1)}${suffix}`
}

function LegacyHealthResultsContent({ results }: { results: LegacyHealthResultsData }) {
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

export function LegacyHealthResults({
  dataPromise,
}: {
  dataPromise: Promise<LegacyHealthLoadState<LegacyHealthResultsData>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyHealthRegionError region="results" />

  return <LegacyHealthResultsContent results={state.data} />
}
