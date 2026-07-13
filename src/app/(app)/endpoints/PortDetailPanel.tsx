'use client'

import { IconX } from '@tabler/icons-react'
import type { EndpointPortSummary } from './sort'
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
          'w-1.5 h-1.5 rounded-full shrink-0',
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
  port: EndpointPortSummary
  onClose: () => void
}) {
  const activeEndpoints = port.endpoints.filter(ep => ep.isActive)

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-20" onClick={onClose} />
      <aside className="animate-panel-in fixed top-0 right-0 z-30 flex h-full w-[840px] max-w-full flex-col border-l border-border bg-card shadow-2xl">
        <div className="px-6 py-5 border-b border-subtle flex items-start justify-between shrink-0 gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-base font-semibold text-foreground truncate" title={`Node ${port.node} / Interface ${port.interface}`}>
              Node {port.node} / Interface {port.interface}
            </h2>
            <p className="text-xs text-subtle mt-0.5 font-mono truncate">
              {activeEndpoints.length} active endpoint{activeEndpoints.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="text-faint hover:text-muted-foreground transition-colors mt-0.5 shrink-0"
          >
            <IconX size={16} stroke={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Summary grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Node</p>
              <p className="text-xs font-mono text-foreground mt-1 truncate" title={port.node}>{port.node}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">Interface</p>
              <p className="text-xs font-mono text-foreground mt-1 truncate" title={port.interface}>{port.interface}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">VLANs</p>
              <p className="text-xs font-mono text-foreground mt-1 truncate" title={port.vlans.join(', ')}>{port.vlans.join(', ') || '—'}</p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
              Learned Endpoints ({activeEndpoints.length})
            </p>
            <div className="border border-border rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-subtle bg-muted">
                    {['MAC', 'IP', 'VLAN', 'EPG Description', 'First Seen', 'Last Seen', 'Status'].map(h => (
                      <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
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
                    activeEndpoints.map(ep => (
                      <tr key={ep.id} className="border-b border-border-faint last:border-0 hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-foreground whitespace-nowrap">{ep.mac}</td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground whitespace-nowrap">{ep.ip || '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-muted-foreground whitespace-nowrap">{ep.vlan}</td>
                        <td className="px-4 py-2.5 text-subtle max-w-[180px] truncate" title={ep.epgDescr}>{ep.epgDescr || '—'}</td>
                        <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmt(ep.firstSeenAt)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-faint whitespace-nowrap">{fmt(ep.lastSeenAt)}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap"><Badge active={ep.isActive} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
