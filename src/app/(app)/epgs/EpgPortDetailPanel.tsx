'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EpgPortSummary } from './sort'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm bg-muted border border-border px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground mr-1 mb-1">
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
    <Sheet open={port !== null} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 border-l border-border bg-card shadow-2xl data-[side=right]:sm:max-w-[720px]">
        {port && (
          <>
            <SheetHeader className="px-6 py-5 border-b border-subtle shrink-0">
              <SheetTitle className="font-serif text-base font-semibold text-foreground truncate pr-6" title={`Node ${port.node} / Port ${port.port}`}>
                Node {port.node} / Port {port.port}
              </SheetTitle>
              <SheetDescription className="text-xs text-subtle font-mono truncate">
                {port.epgCount} bound EPG{port.epgCount === 1 ? '' : 's'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Summary grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Node</p>
                  <p className="text-xs font-mono text-foreground mt-1 truncate" title={port.node}>{port.node}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Port</p>
                  <p className="text-xs font-mono text-foreground mt-1 truncate" title={port.port}>{port.port}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Type</p>
                  <p className="text-xs uppercase text-subtle mt-1 font-semibold">{port.pathType}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1.5">Tenants</p>
                <div>
                  {port.tenants.length > 0
                    ? port.tenants.map(t => <Pill key={t}>{t}</Pill>)
                    : <span className="text-xs text-faint">—</span>}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
                  Bound EPGs ({port.bindings.length})
                </p>
                <div className="border border-border rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-subtle bg-muted">
                        {['EPG Name', 'App Profile', 'Tenant', 'Encap', 'Mode'].map(h => (
                          <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {port.bindings.map(b => (
                        <tr key={b.id} className="border-b border-border-faint last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-2.5 font-mono font-medium text-foreground whitespace-nowrap">{b.epg.name}</td>
                          <td className="px-4 py-2.5 font-mono text-subtle text-[11px] whitespace-nowrap">{b.epg.appProfile}</td>
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{b.epg.tenant}</td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{b.encap || '—'}</td>
                          <td className="px-4 py-2.5 text-subtle whitespace-nowrap">{b.mode}</td>
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
