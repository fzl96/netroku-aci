'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import type { EpgRow } from '@/lib/epgs/query'
import { sortBindingRows } from '@/lib/epgs/sort'
import { MUTED_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">{label}</p>
      <div className="mt-1 text-xs text-foreground">{children}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-1 mb-1 inline-block rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

function Flag({ on }: { on: boolean }) {
  return <span className={on ? 'font-medium text-success' : 'text-faint'}>{on ? 'Yes' : 'No'}</span>
}

export function EpgDetailPanel({ epg, onClose }: { epg: EpgRow | null; onClose: () => void }) {
  const bindings = epg ? sortBindingRows(epg.bindings) : []

  return (
    <Sheet
      open={epg !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-[640px]"
      >
        {epg && (
          <>
            <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
              <SheetTitle className="truncate pr-6 font-serif text-base font-semibold text-foreground">
                {epg.name}
              </SheetTitle>
              <SheetDescription className="truncate font-mono text-xs text-subtle" title={epg.dn}>
                {epg.tenant} / {epg.appProfile}
              </SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              {epg.description && <Field label="Description">{epg.description}</Field>}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Bridge Domain">
                  <span className="font-mono">{epg.bridgeDomain || '—'}</span>
                </Field>
                <Field label="pcTag">
                  <span className="font-mono tabular-nums">{epg.pcTag || '—'}</span>
                </Field>
                <Field label="Preferred Group">
                  <Flag on={epg.preferredGroup} />
                </Field>
                <Field label="Intra-EPG Isolation">
                  <Flag on={epg.isolation} />
                </Field>
              </div>

              <Field label="Domains">
                {epg.domains.length > 0 ? (
                  epg.domains.map((d: string) => <Pill key={d}>{d}</Pill>)
                ) : (
                  <span className="text-faint">—</span>
                )}
              </Field>
              <Field label="Provided Contracts">
                {epg.providedContracts.length > 0 ? (
                  epg.providedContracts.map((c: string) => <Pill key={c}>{c}</Pill>)
                ) : (
                  <span className="text-faint">—</span>
                )}
              </Field>
              <Field label="Consumed Contracts">
                {epg.consumedContracts.length > 0 ? (
                  epg.consumedContracts.map((c: string) => <Pill key={c}>{c}</Pill>)
                ) : (
                  <span className="text-faint">—</span>
                )}
              </Field>

              <div>
                <p className="mb-2 text-[10px] font-semibold tracking-wider text-subtle uppercase">
                  Port Bindings ({bindings.length})
                </p>
                {bindings.length === 0 ? (
                  <p className="text-xs text-faint">No static port bindings.</p>
                ) : (
                  <div className="overflow-hidden rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-subtle bg-muted">
                          {['Pod', 'Node', 'Port', 'Type', 'Encap', 'Mode'].map((h) => (
                            <th key={h} className={MUTED_TABLE_HEAD_CLS}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bindings.map((b) => (
                          <tr key={b.id} className="border-b border-border-faint last:border-0">
                            <td className="px-4 py-2 text-muted-foreground tabular-nums">
                              {b.pod || '—'}
                            </td>
                            <td className="px-4 py-2 text-foreground tabular-nums">
                              {b.node || '—'}
                            </td>
                            <td
                              className="max-w-[140px] truncate px-4 py-2 font-mono text-muted-foreground"
                              title={b.port}
                            >
                              {b.port}
                            </td>
                            <td className="px-4 py-2 text-[10px] text-subtle uppercase">
                              {b.pathType}
                            </td>
                            <td className="px-4 py-2 font-mono text-muted-foreground">
                              {b.encap || '—'}
                            </td>
                            <td className="px-4 py-2 text-subtle">{b.mode}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
