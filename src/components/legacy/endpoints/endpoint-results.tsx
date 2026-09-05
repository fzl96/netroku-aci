'use client'

import { use } from 'react'
import { IconDevices } from '@tabler/icons-react'
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
  LegacyEndpointLoadState,
  LegacyEndpointResults as LegacyEndpointResultsData,
} from '@/lib/legacy/endpoints/query'
import { LegacyEndpointRegionError } from './endpoint-region-error'

function statusBadge(active: boolean) {
  return active ? (
    <span className="inline-flex rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
      Active
    </span>
  ) : (
    <span className="inline-flex rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-subtle">
      Historical
    </span>
  )
}

export function LegacyMac({ mac, macFlag }: { mac: string; macFlag: string }) {
  return <>{macFlag ? `${macFlag} ${mac}` : mac}</>
}

function LegacyEndpointResultsContent({ results }: { results: LegacyEndpointResultsData }) {
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
      <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto md:block">
        <table className="w-full text-xs">
          <thead>
            <tr>
              {[
                'Device',
                'MAC',
                'IP address',
                'VLAN',
                'Interface',
                'Learning',
                'Status',
                'First seen',
                'Last seen',
                'Cleared',
              ].map((label) => (
                <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-border/70 hover:bg-muted/60">
                <td className="px-4 py-3 font-semibold text-foreground">
                  {row.hostname}
                  <div className="text-[10px] font-normal text-faint">{row.site}</div>
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap text-foreground">
                  <LegacyMac mac={row.mac} macFlag={row.macFlag} />
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap text-subtle">
                  {row.ip ?? <span className="font-sans text-faint">Not reported</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-subtle">
                  {row.vlan}
                  {row.vlanName && <div className="text-[10px] text-faint">{row.vlanName}</div>}
                </td>
                <td className="px-4 py-3 font-mono whitespace-nowrap text-subtle">
                  {row.interface || '—'}
                </td>
                <td className="px-4 py-3 text-subtle">{row.learningType || '—'}</td>
                <td className="px-4 py-3">{statusBadge(row.isActive)}</td>
                <td className="px-4 py-3 whitespace-nowrap text-subtle">
                  {new Date(row.firstSeenAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-subtle">
                  {new Date(row.lastSeenAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-subtle">
                  {row.clearedAt ? new Date(row.clearedAt).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2 p-3 md:hidden">
        {rows.map((row) => (
          <DataCard key={row.id}>
            <DataCardHeader trailing={statusBadge(row.isActive)}>
              <DataCardTitle>
                <LegacyMac mac={row.mac} macFlag={row.macFlag} />
              </DataCardTitle>
            </DataCardHeader>
            <DataCardBody>
              <DataCardRow label="Device" value={`${row.hostname} · ${row.site}`} />
              <DataCardRow label="IP" value={row.ip || 'Not reported'} />
              <DataCardRow
                label="Placement"
                value={`VLAN ${row.vlan} · ${row.interface || 'Unknown interface'}`}
              />
              <DataCardRow label="Last seen" value={new Date(row.lastSeenAt).toLocaleString()} />
            </DataCardBody>
          </DataCard>
        ))}
      </div>
      <LegacyPagination page={page} pageSize={pageSize} total={total} />
    </div>
  )
}

export function LegacyEndpointResults({
  dataPromise,
}: {
  dataPromise: Promise<LegacyEndpointLoadState<LegacyEndpointResultsData>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <LegacyEndpointRegionError region="results" />

  return <LegacyEndpointResultsContent results={state.data} />
}
