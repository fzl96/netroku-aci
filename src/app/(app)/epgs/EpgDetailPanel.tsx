'use client'

import { IconX } from '@tabler/icons-react'
import type { EpgWithBindings } from '@/lib/epgs/query'
import { sortBindingRows } from './sort'
import { MUTED_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
      <div className="text-xs text-foreground mt-1">{children}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm bg-muted border border-border px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground mr-1 mb-1">
      {children}
    </span>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-success font-medium' : 'text-faint'}>
      {on ? 'Yes' : 'No'}
    </span>
  )
}

export function EpgDetailPanel({ epg, onClose }: { epg: EpgWithBindings; onClose: () => void }) {
  const bindings = sortBindingRows(epg.bindings)

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-20" onClick={onClose} />
      <aside className="animate-panel-in fixed top-0 right-0 z-30 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-2xl">
        <div className="px-6 py-5 border-b border-subtle flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-foreground truncate">{epg.name}</h2>
            <p className="text-xs text-subtle mt-0.5 font-mono truncate" title={epg.dn}>
              {epg.tenant} / {epg.appProfile}
            </p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-muted-foreground transition-colors mt-0.5 shrink-0">
            <IconX size={16} stroke={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {epg.description && <Field label="Description">{epg.description}</Field>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bridge Domain">
              <span className="font-mono">{epg.bridgeDomain || '—'}</span>
            </Field>
            <Field label="pcTag">
              <span className="font-mono tabular-nums">{epg.pcTag || '—'}</span>
            </Field>
            <Field label="Preferred Group"><Flag on={epg.preferredGroup} /></Field>
            <Field label="Intra-EPG Isolation"><Flag on={epg.isolation} /></Field>
          </div>

          <Field label="Domains">
            {epg.domains.length > 0 ? epg.domains.map((d: string) => <Pill key={d}>{d}</Pill>) : <span className="text-faint">—</span>}
          </Field>
          <Field label="Provided Contracts">
            {epg.providedContracts.length > 0 ? epg.providedContracts.map((c: string) => <Pill key={c}>{c}</Pill>) : <span className="text-faint">—</span>}
          </Field>
          <Field label="Consumed Contracts">
            {epg.consumedContracts.length > 0 ? epg.consumedContracts.map((c: string) => <Pill key={c}>{c}</Pill>) : <span className="text-faint">—</span>}
          </Field>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
              Port Bindings ({bindings.length})
            </p>
            {bindings.length === 0 ? (
              <p className="text-xs text-faint">No static port bindings.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-subtle bg-muted">
                      {['Pod', 'Node', 'Port', 'Type', 'Encap', 'Mode'].map(h => (
                        <th key={h} className={MUTED_TABLE_HEAD_CLS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map(b => (
                      <tr key={b.id} className="border-b border-border-faint last:border-0">
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{b.pod || '—'}</td>
                        <td className="px-4 py-2 tabular-nums text-foreground">{b.node || '—'}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground max-w-[140px] truncate" title={b.port}>{b.port}</td>
                        <td className="px-4 py-2 text-subtle uppercase text-[10px]">{b.pathType}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{b.encap || '—'}</td>
                        <td className="px-4 py-2 text-subtle">{b.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
