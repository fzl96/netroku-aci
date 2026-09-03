'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EpgPortSummary } from '@/lib/epgs/sort'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1 mb-1 inline-block rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

export function EpgPortDetailPanel({
  port,
  onClose,
}: {
  port: EpgPortSummary | null
  onClose: () => void
}) {
  return (
    <Sheet
      open={port !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-[720px]"
      >
        {port && (
          <>
            <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
              <SheetTitle
                className="truncate pr-6 font-serif text-base font-semibold text-foreground"
                title={`Node ${port.node} / Port ${port.port}`}
              >
                Node {port.node} / Port {port.port}
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs text-subtle">
                {port.epgCount} bound EPG{port.epgCount === 1 ? '' : 's'}
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
                    Port
                  </p>
                  <p className="mt-1 truncate font-mono text-xs text-foreground" title={port.port}>
                    {port.port}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                    Type
                  </p>
                  <p className="mt-1 text-xs font-semibold text-subtle uppercase">
                    {port.pathType}
                  </p>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-semibold tracking-wider text-subtle uppercase">
                  Tenants
                </p>
                <div>
                  {port.tenants.length > 0 ? (
                    port.tenants.map((t) => <Pill key={t}>{t}</Pill>)
                  ) : (
                    <span className="text-xs text-faint">—</span>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-wider text-subtle uppercase">
                  Bound EPGs ({port.bindings.length})
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-subtle bg-muted">
                        {['EPG Name', 'App Profile', 'Tenant', 'Encap', 'Mode'].map((h) => (
                          <th key={h} className={DENSE_TABLE_HEAD_CLS}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {port.bindings.map((b) => (
                        <tr
                          key={b.id}
                          className="border-b border-border-faint transition-colors last:border-0 hover:bg-muted/50"
                        >
                          <td className="px-4 py-2.5 font-mono font-medium whitespace-nowrap text-foreground">
                            {b.epg.name}
                          </td>
                          <td className="px-4 py-2.5 font-mono text-[11px] whitespace-nowrap text-subtle">
                            {b.epg.appProfile}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                            {b.epg.tenant}
                          </td>
                          <td className="px-4 py-2.5 font-mono whitespace-nowrap text-muted-foreground">
                            {b.encap || '—'}
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-subtle">{b.mode}</td>
                        </tr>
                      ))}
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
