'use client'

import { Fragment, useState, useTransition } from 'react'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconHistory,
} from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import type { AuditLogEntry } from '@/actions/audit'
import type { AuditAction, AuditStatus } from '@/lib/audit'
import {
  buildHistoryUrl,
  HISTORY_ACTION_LABELS,
  HISTORY_PAGE_SIZE,
  type HistoryActionFilter,
} from '@/lib/history/query'
import {
  DENSE_TABLE_HEAD_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
import {
  buildHistoryPayloadCsvExport,
  buildHistoryPayloadSummary,
  formatHistoryPayloadSummary,
} from './export-utils'

const STATUS_STYLES: Record<AuditStatus, string> = {
  success: 'border-success-border bg-success-bg text-success',
  partial: 'border-warning-border bg-warning-bg text-warning',
  failure: 'border-error-border bg-error-bg text-error',
}

function actionLabel(action: string): string {
  return HISTORY_ACTION_LABELS[action as AuditAction] ?? action
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

export function HistoryResultsClient({
  logs,
  total,
  page,
  query,
  action,
}: {
  logs: AuditLogEntry[]
  total: number
  page: number
  query: string
  action: HistoryActionFilter
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))

  function toggle(id: string) {
    setExpanded(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function navigate(nextPage: number) {
    startTransition(() => {
      router.replace(buildHistoryUrl({
        query,
        action,
        page: nextPage,
      }))
    })
  }

  return (
    <div className="space-y-4" aria-busy={isPending}>
      <div className="flex justify-end">
        <span className="text-[11px] text-faint tabular-nums">
          {total} {total === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm animate-fade-up">
        <div className={TABLE_SCROLL_CLS}>
          <table className="w-full text-xs">
            <thead>
              <tr>
                {['When', 'User', 'Action', 'Target', 'Status', 'Detail'].map(header => (
                  <th key={header} className={DENSE_TABLE_HEAD_CLS}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted">
                      <IconHistory size={18} stroke={1.5} className="text-faint" />
                    </div>
                    <p className="text-sm text-subtle">No activity found</p>
                    <p className="mt-1 text-xs text-faint">
                      Try changing the search or action filter.
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log, index) => {
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
                        className="group border-b border-border-faint transition-colors duration-100 animate-fade-up hover:bg-muted"
                        style={{ animationDelay: `${Math.min(index * 25, 180)}ms` }}
                      >
                        <td className="whitespace-nowrap border-l-2 border-l-transparent px-4 py-2.5 transition-colors duration-100 group-hover:border-l-primary">
                          <div className="text-foreground">{formatRelative(when)}</div>
                          <div className="text-[10px] text-faint tabular-nums">
                            {when.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-border bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
                              {log.userName.slice(0, 1)}
                            </div>
                            <span className="font-medium text-foreground">{log.userName}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {actionLabel(log.action)}
                          </span>
                        </td>
                        <td
                          className="max-w-[20rem] truncate px-4 py-2.5 text-subtle"
                          title={log.target ?? ''}
                        >
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
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary transition-colors hover:text-primary/80"
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
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigate(Math.max(1, page - 1))}
              disabled={page <= 1 || isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              <IconChevronLeft size={13} stroke={1.75} />
              Prev
            </button>
            <button
              type="button"
              onClick={() => navigate(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages || isPending}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
            >
              Next
              <IconChevronRight size={13} stroke={1.75} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
