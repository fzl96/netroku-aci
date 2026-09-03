'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EndpointPortSummary } from '@/lib/endpoints/sort'
import type { EndpointRow } from '@/lib/endpoints/query'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function Badge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        'flex items-center gap-1.5 text-[10px] font-medium',
        active ? 'text-success' : 'text-faint',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 shrink-0 rounded-full',
          active ? 'bg-success-dot' : 'bg-border',
        ].join(' ')}
      />
      {active ? 'Active' : 'Historical'}
    </span>
  )
}

export function PortDetailPanel({
  port,
  onClose,
}: {
  port: EndpointPortSummary<EndpointRow> | null
  onClose: () => void
}) {
  const activeEndpoints = port ? port.endpoints.filter((ep) => ep.isActive) : []

  return (
    <Sheet
      open={port !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-[840px]"
      >
        {port && (
          <>
            <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
              <SheetTitle
                className="truncate pr-6 font-serif text-base font-semibold text-foreground"
                title={`Node ${port.node} / Interface ${port.interface}`}
              >
                Node {port.node} / Interface {port.interface}
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs text-subtle">
                {activeEndpoints.length} active endpoint{activeEndpoints.length === 1 ? '' : 's'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {/* Summary grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                    Node
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground" title={port.node}>
                    {port.node}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                    Interface
                  </p>
                  <p
                    className="mt-1 truncate font-mono text-xs text-foreground"
                    title={port.interface}
                  >
                    {port.interface}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                    VLANs
                  </p>
                  <p
                    className="mt-1 truncate font-mono text-xs text-foreground"
                    title={port.vlans.join(', ')}
                  >
                    {port.vlans.join(', ') || '—'}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-wider text-subtle uppercase">
                  Learned Endpoints ({activeEndpoints.length})
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-subtle bg-muted">
                        {[
                          'MAC',
                          'IP',
                          'VLAN',
                          'EPG Description',
                          'First Seen',
                          'Last Seen',
                          'Status',
                        ].map((h) => (
                          <th key={h} className={DENSE_TABLE_HEAD_CLS}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeEndpoints.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-xs text-subtle">
                            No active endpoints learned on this port
                          </td>
                        </tr>
                      ) : (
                        activeEndpoints.map((ep) => (
                          <tr
                            key={ep.id}
                            className="border-b border-border-faint transition-colors last:border-0 hover:bg-muted/50"
                          >
                            <td className="px-4 py-2.5 font-mono whitespace-nowrap text-foreground">
                              {ep.mac}
                            </td>
                            <td className="px-4 py-2.5 font-mono whitespace-nowrap text-muted-foreground">
                              {ep.ip || '—'}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                              {ep.vlan}
                            </td>
                            <td
                              className="max-w-[180px] truncate px-4 py-2.5 text-subtle"
                              title={ep.epgDescr}
                            >
                              {ep.epgDescr || '—'}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                              {fmt(ep.firstSeenAt)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap text-faint tabular-nums">
                              {fmt(ep.lastSeenAt)}
                            </td>
                            <td className="px-4 py-2.5 whitespace-nowrap">
                              <Badge active={ep.isActive} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
