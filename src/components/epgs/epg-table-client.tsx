'use client'

import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import type { EpgResultsData } from '@/lib/epgs/query'
import type { EpgPortSummary } from '@/lib/epgs/sort'

export function EpgTableClient({
  results,
  onEpgSelect,
  onPortSelect,
}: {
  results: EpgResultsData
  onEpgSelect: (id: string) => void
  onPortSelect: (port: EpgPortSummary) => void
}) {
  return (
    <div className={TABLE_SCROLL_CLS}>
      {results.view === 'epg' ? (
        <table className="w-full text-xs">
          <thead>
            <tr>
              {['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts'].map(
                (label) => (
                  <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onEpgSelect(row.id)}
                className="cursor-pointer border-b border-border-faint hover:bg-muted"
              >
                <td className="border-l-2 border-l-transparent px-4 py-2.5 font-mono font-medium">
                  {row.name}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row.tenant}</td>
                <td className="px-4 py-2.5 font-mono text-subtle">{row.appProfile}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">
                  {row.bridgeDomain || '—'}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{row.bindings.length}</td>
                <td className="px-4 py-2.5 tabular-nums">
                  {row.providedContracts.length + row.consumedContracts.length}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr>
              {['Node', 'Port', 'Type', 'EPGs', 'Tenants', 'Encaps / VLANs', 'Mode'].map(
                (label) => (
                  <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onPortSelect(row)}
                className="cursor-pointer border-b border-border-faint hover:bg-muted"
              >
                <td className="px-4 py-2.5 font-medium">{row.node}</td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">{row.port}</td>
                <td className="px-4 py-2.5 text-subtle">{row.pathType}</td>
                <td className="px-4 py-2.5 font-semibold">{row.epgCount}</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {row.tenants.join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-muted-foreground">
                  {row.encaps.join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5 text-subtle">{row.modes.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
