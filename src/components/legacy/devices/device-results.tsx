'use client'

import { use, useState } from 'react'
import { IconServer2 } from '@tabler/icons-react'
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
import type {
  LegacyDeviceLoadState,
  LegacyDeviceResults as LegacyDeviceResultsData,
  LegacyDeviceRow,
} from '@/lib/legacy/devices/query'
import { LegacyDeviceDrawer } from './device-drawer'
import { LegacyDeviceRegionError } from './device-region-error'

function LegacyDeviceResultsContent({ results }: { results: LegacyDeviceResultsData }) {
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
                  <td className="px-4 py-3 font-semibold whitespace-nowrap text-foreground">
                    {row.hostname}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{row.site}</td>
                  <td className="px-4 py-3 font-mono whitespace-nowrap text-muted-foreground">
                    {row.managementIp}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    <div>{row.vendor || 'Unknown vendor'}</div>
                    <div className="text-[10px] text-faint">{row.deviceType}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    <div>{row.model || '—'}</div>
                    <div className="text-[10px] text-faint">{row.serialNumber || 'No serial'}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.softwareVersion || '—'}</td>
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
                <DataCardRow label="Software" value={row.softwareVersion || 'Not reported'} />
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

export function LegacyDeviceResults({
  dataPromise,
}: {
  dataPromise: Promise<LegacyDeviceLoadState<LegacyDeviceResultsData>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyDeviceRegionError region="results" />

  return <LegacyDeviceResultsContent results={state.data} />
}
