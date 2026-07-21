'use client'

import { Fragment, useMemo, useState } from 'react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconHistory,
  IconSearch,
} from '@tabler/icons-react'
import type { AuditLogEntry } from '@/actions/audit'
import type { AuditAction, AuditStatus } from '@/lib/audit'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import {
  buildHistoryPayloadCsvExport,
  buildHistoryPayloadSummary,
  formatHistoryPayloadSummary,
} from './export-utils'

const PAGE_SIZE = 20

const HISTORY_SELECT_CLS =
  'w-44 cursor-pointer bg-muted border border-border rounded-lg pl-3 pr-8 py-1.5 ' +
  'text-xs text-foreground outline-none ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors'

const ACTION_LABELS: Record<AuditAction, string> = {
  'apic_host.create': 'Host added',
  'apic_host.update': 'Host updated',
  'apic_host.delete': 'Host deleted',
  deploy: 'Deploy',
  rollback: 'Rollback',
  'resync.endpoints': 'Resync endpoints',
  'resync.interfaces': 'Resync interfaces',
  'resync.faults': 'Resync faults',
  'resync.health': 'Resync health',
  'resync.nodes': 'Resync nodes',
  'resync.epgs': 'Resync EPGs',
  'ingest.legacy.health': 'Ingest legacy health',
  'ingest.legacy.interfaces': 'Ingest legacy interfaces',
  'ingest.legacy.endpoints': 'Ingest legacy endpoints',
  'user.create': 'User created',
  'user.delete': 'User deleted',
}

const STATUS_STYLES: Record<AuditStatus, string> = {
  success: 'border-success-border bg-success-bg text-success',
  partial: 'border-warning-border bg-warning-bg text-warning',
  failure: 'border-error-border bg-error-bg text-error',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action as AuditAction] ?? action
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return date.toLocaleDateString()
}

function StatusBadge({ status }: { status: AuditStatus }) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
        STATUS_STYLES[status],
      ].join(' ')}
    >
      {status}
    </span>
  )
}

export function HistoryClient({ initialLogs }: { initialLogs: AuditLogEntry[] }) {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)

  const actionsPresent = useMemo(() => {
    const set = new Set<AuditAction>()
    for (const log of initialLogs) set.add(log.action)
    return Array.from(set).sort()
  }, [initialLogs])

  const logs = useMemo(() => {
    const query = search.trim().toLowerCase()
    return initialLogs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false
      if (!query) return true
      return (
        log.userName.toLowerCase().includes(query) ||
        (log.target ?? '').toLowerCase().includes(query) ||
        (log.detail ?? '').toLowerCase().includes(query) ||
        actionLabel(log.action).toLowerCase().includes(query)
      )
    })
  }, [initialLogs, search, actionFilter])

  const total = logs.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageLogs = logs.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">History</h1>
            <p className="text-xs text-subtle mt-0.5">Activity log of actions across Netroku ACI</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <IconSearch
              size={14}
              stroke={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={search}
              onChange={event => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search user, target, detail…"
              className={SEARCH_INPUT_CLS}
            />
          </div>
          <select
            value={actionFilter}
            onChange={event => {
              setActionFilter(event.target.value as 'all' | AuditAction)
              setPage(1)
            }}
            className={HISTORY_SELECT_CLS}
          >
            <option value="all">All actions</option>
            {actionsPresent.map(action => (
              <option key={action} value={action}>
                {actionLabel(action)}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11px] text-faint tabular-nums">
            {total} {total === 1 ? 'entry' : 'entries'}
          </span>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['When', 'User', 'Action', 'Target', 'Status', 'Detail'].map(header => (
                    <th
                      key={header}
                      className={DENSE_TABLE_HEAD_CLS}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                        <IconHistory size={18} stroke={1.5} className="text-faint" />
                      </div>
                      <p className="text-sm text-subtle">No activity yet</p>
                      <p className="text-xs text-faint mt-1">Actions taken in the app will appear here.</p>
                    </td>
                  </tr>
                ) : (
                  pageLogs.map((log, index) => {
                    const hasPayload = log.payload != null
                    const isOpen = expanded.has(log.id)
                    const when = new Date(log.createdAt)
                    const csvExport = isOpen ? buildHistoryPayloadCsvExport({
                      action: log.action,
                      target: log.target,
                      payload: log.payload,
                      createdAt: when,
                    }) : null
                    const payloadSummary = isOpen ? buildHistoryPayloadSummary({
                      action: log.action,
                      target: log.target,
                      payload: log.payload,
                    }) : null
                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="group border-b border-border-faint hover:bg-muted transition-colors duration-100 animate-fade-up"
                          style={{ animationDelay: `${Math.min(index * 25, 180)}ms` }}
                        >
                          <td className="px-4 py-2.5 whitespace-nowrap border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                            <div className="text-foreground">{formatRelative(when)}</div>
                            <div className="text-[10px] text-faint tabular-nums">{when.toLocaleString()}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-lg bg-muted border border-border flex items-center justify-center text-[10px] font-semibold text-muted-foreground uppercase">
                                {log.userName.slice(0, 1)}
                              </div>
                              <span className="font-medium text-foreground">{log.userName}</span>
                            </div>
                          </td>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                              {actionLabel(log.action)}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-subtle max-w-[20rem] truncate" title={log.target ?? ''}>
                            {log.target ?? '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            <StatusBadge status={log.status} />
                          </td>
                          <td className="px-4 py-2.5 text-subtle">
                            <div className="flex items-center gap-2">
                              <span>{log.detail ?? '—'}</span>
                              {hasPayload && (
                                <button
                                  type="button"
                                  onClick={() => toggle(log.id)}
                                  className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary hover:text-primary/80 transition-colors"
                                  aria-expanded={isOpen}
                                >
                                  <IconChevronRight
                                    size={12}
                                    stroke={2}
                                    className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}
                                  />
                                  payload
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {hasPayload && isOpen && (
                          <tr className="border-b border-border-faint bg-muted/40">
                            <td colSpan={6} className="px-4 py-3">
                              {csvExport && payloadSummary && (
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <span className="text-[11px] text-faint tabular-nums">
                                    {formatHistoryPayloadSummary(payloadSummary)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const blob = new Blob([csvExport.csv], {
                                        type: 'text/csv;charset=utf-8',
                                      })
                                      const url = URL.createObjectURL(blob)
                                      const link = document.createElement('a')
                                      link.href = url
                                      link.download = csvExport.filename
                                      document.body.appendChild(link)
                                      link.click()
                                      link.remove()
                                      URL.revokeObjectURL(url)
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                    title="Export this payload in its original CSV format"
                                  >
                                    <IconDownload size={13} stroke={1.75} />
                                    Export CSV
                                  </button>
                                </div>
                              )}
                              <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-background p-3 text-[11px] leading-relaxed text-foreground">
                                {JSON.stringify(log.payload, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-faint tabular-nums">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              >
                <IconChevronLeft size={13} stroke={1.75} />
                Prev
              </button>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
              >
                Next
                <IconChevronRight size={13} stroke={1.75} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
