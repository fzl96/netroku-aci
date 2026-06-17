// src/components/PreviewSection.tsx
'use client'

import { useEffect, useState } from 'react'
import type { ParsedRow, ValidationResult, RowStatus } from '@/lib/apic/types'
import { MUTED_TABLE_HEAD_CLS } from '@/lib/ui-classes'
import { cn } from '@/lib/utils'

type Mode = 'deploy' | 'rollback'
type Feature =
  | 'static-ports'
  | 'interface-selectors'
  | 'bridge-domains-l2'
  | 'bridge-domains-l3'
  | 'epg'
  | 'epg-consumer'
  | 'epg-provider'
  | 'epg-contract'
  | 'epg-consumer-contract'
  | 'epg-provider-contract'

export interface PreviewColumn<TRow> {
  header: string
  cell: (row: TRow, index: number) => React.ReactNode
  className?: string
}

interface PreviewSectionProps<TRow extends { rowIndex: number }> {
  rows: TRow[]
  apicHost: string
  apicToken: string
  mode?: Mode
  feature?: Feature
  columns?: PreviewColumn<TRow>[]
  formatRowLabel?: (row: TRow) => string
  onDeploy: (deployRows: TRow[]) => void
  onChangeCSV: () => void
  onReconnect: () => void
}

const ENDPOINTS: Record<Feature, Partial<Record<Mode, string>>> = {
  'static-ports': {
    deploy: '/api/apic/validate',
    rollback: '/api/apic/validate-rollback',
  },
  'interface-selectors': {
    deploy: '/api/apic/interface-selectors/validate',
    rollback: '/api/apic/interface-selectors/validate-rollback',
  },
  'bridge-domains-l2': {
    deploy: '/api/apic/bridge-domains/l2/validate',
    rollback: '/api/apic/bridge-domains/l2/validate-rollback',
  },
  'bridge-domains-l3': {
    deploy: '/api/apic/bridge-domains/l3/validate',
    rollback: '/api/apic/bridge-domains/l3/validate-rollback',
  },
  'epg': {
    deploy: '/api/apic/bridge-domains/epgs/validate',
    rollback: '/api/apic/bridge-domains/epgs/rollback/validate',
  },
  'epg-consumer': {
    deploy: '/api/apic/bridge-domains/epgs/consumer/validate',
  },
  'epg-provider': {
    deploy: '/api/apic/bridge-domains/epgs/provider/validate',
  },
  'epg-contract': {
    rollback: '/api/apic/bridge-domains/epgs/rollback/validate',
  },
  'epg-consumer-contract': {
    rollback: '/api/apic/bridge-domains/epgs/consumer/validate-rollback',
  },
  'epg-provider-contract': {
    rollback: '/api/apic/bridge-domains/epgs/provider/validate-rollback',
  },
}

const MODE_CONFIG: Record<Mode, {
  actionableStatus: RowStatus
  skippedStatus: RowStatus
  skippedLabel: string
  buttonVerb: string
  countLabel: string
}> = {
  deploy: {
    actionableStatus: 'deploy',
    skippedStatus: 'exists',
    skippedLabel: 'Skipped',
    buttonVerb: 'Deploy',
    countLabel: 'to deploy',
  },
  rollback: {
    actionableStatus: 'rollback',
    skippedStatus: 'missing',
    skippedLabel: 'Not found',
    buttonVerb: 'Rollback',
    countLabel: 'to remove',
  },
}

const STATIC_PORT_COLUMNS: PreviewColumn<ParsedRow>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-faint tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-foreground' },
  { header: 'AP', cell: r => r.ap, className: 'text-foreground' },
  { header: 'EPG', cell: r => r.epg, className: 'text-foreground' },
  { header: 'VLAN', cell: r => r.vlan, className: 'font-mono text-foreground' },
  { header: 'Nodes', cell: r => r.node2 ? `${r.node1} / ${r.node2}` : r.node1, className: 'font-mono text-foreground' },
  { header: 'Type', cell: r => r.port_type, className: 'text-foreground' },
  { header: 'Interface / IPG', cell: r => r.interface_or_ipg, className: 'font-mono text-foreground' },
  { header: 'Mode', cell: r => r.mode, className: 'text-foreground' },
]

function staticPortLabel(r: ParsedRow): string {
  return `Row ${r.rowIndex} — ${r.tenant}/${r.ap}/${r.epg} · VLAN ${r.vlan}`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden
      className={cn('transition-transform duration-200', open && 'rotate-180')}
    >
      <path
        d="M2 4.5L6 8l4-3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface IssueRowProps {
  label: string
  result: ValidationResult
  skippedLabel: string
}

function IssueRow({ label, result, skippedLabel }: IssueRowProps) {
  const isError = result.status === 'error'
  return (
    <div className="flex items-start gap-3 border-b border-border-faint py-2 last:border-0">
      <span
        className={cn(
          'mt-0.5 shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
          isError ? 'bg-error-bg text-error' : 'bg-warning-bg text-warning',
        )}
      >
        {isError ? 'Error' : skippedLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs font-medium text-foreground">{label}</p>
        {result.message && <p className="mt-0.5 text-xs text-subtle">{result.message}</p>}
      </div>
    </div>
  )
}

export function PreviewSection<TRow extends { rowIndex: number } = ParsedRow>({
  rows,
  apicHost,
  apicToken,
  mode = 'deploy',
  feature = 'static-ports',
  columns,
  formatRowLabel,
  onDeploy,
  onChangeCSV,
  onReconnect,
}: PreviewSectionProps<TRow>) {
  const cfg = MODE_CONFIG[mode]
  const endpoint = ENDPOINTS[feature][mode]
  const cols = (columns ?? (STATIC_PORT_COLUMNS as unknown as PreviewColumn<TRow>[]))
  const labelFn = formatRowLabel ?? ((r: TRow) => (staticPortLabel as (x: unknown) => string)(r))

  const [results, setResults]     = useState<ValidationResult[] | null>(null)
  const [loading, setLoading]     = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [issuesOpen, setIssuesOpen] = useState(false)

  useEffect(() => {
    if (rows.length === 0) return
    if (!endpoint) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setFetchError(null)
      setIssuesOpen(false)

      fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows, apicHost, apicToken }),
        signal:  controller.signal,
      })
        .then(r => r.json() as Promise<{ results?: ValidationResult[]; error?: string }>)
        .then(data => {
          if (controller.signal.aborted) return
          if (data.error) { setFetchError(data.error); return }
          setResults(data.results ?? [])
        })
        .catch(() => {
          if (!controller.signal.aborted) setFetchError('Validation request failed')
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [rows, apicHost, apicToken, endpoint, feature, mode])

  const statusMap  = new Map(results?.map(r => [r.rowIndex, r]) ?? [])
  const actionableRows = rows.filter(r => statusMap.get(r.rowIndex)?.status === cfg.actionableStatus)
  const actionableCount = actionableRows.length
  const issueRows  = rows
    .map(r => ({ row: r, result: statusMap.get(r.rowIndex) }))
    .filter((x): x is { row: TRow; result: ValidationResult } =>
      x.result?.status === 'error' || x.result?.status === cfg.skippedStatus
    )
  const errorCount   = issueRows.filter(x => x.result.status === 'error').length
  const skippedCount = issueRows.filter(x => x.result.status === cfg.skippedStatus).length
  const hasIssues    = issueRows.length > 0

  if (loading) {
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-subtle">
          <h2 className="font-serif text-base font-semibold text-foreground">Preview & Validate</h2>
          <p className="text-xs text-subtle mt-0.5">Checking {rows.length} rows against APIC…</p>
        </div>
        <div className="px-6 py-4 space-y-2.5">
          {Array.from({ length: Math.min(rows.length, 5) }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-3 bg-border rounded w-20" />
              <div className="h-3 bg-border rounded w-24" />
              <div className="h-3 bg-border rounded w-16" />
              <div className="h-3 bg-border rounded w-10" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (fetchError) {
    const isExpired = fetchError.includes('401')
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-subtle">
          <h2 className="font-serif text-base font-semibold text-foreground">Preview & Validate</h2>
        </div>
        <div className="px-6 py-5">
          {isExpired ? (
            <div className="flex items-start gap-3 rounded-lg border border-error-border bg-error-bg p-3.5">
              <p className="flex-1 text-xs text-error">
                Your APIC session has expired. Please reconnect to continue.
              </p>
              <button
                type="button"
                onClick={onReconnect}
                className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-primary/90"
              >
                Reconnect →
              </button>
            </div>
          ) : (
            <p className="text-sm text-error">{fetchError}</p>
          )}
        </div>
      </div>
    )
  }

  const sessionExpired = results !== null &&
    results.length > 0 &&
    results.every(r => r.status === 'error' && r.message?.includes('401'))

  return (
    <div>
      {/* Card header */}
      <div className="px-6 pt-6 pb-5 border-b border-subtle">
        <h2 className="font-serif text-base font-semibold text-foreground">Preview & Validate</h2>
        {results && (
          <p className="text-xs text-subtle mt-0.5">
            {rows.length} row{rows.length !== 1 ? 's' : ''} loaded
          </p>
        )}
      </div>

      {/* Table — height-capped so the header card stays visible; thead is sticky within */}
      <div className="overflow-auto max-h-[calc(100svh-360px)] min-h-[200px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-subtle bg-muted">
              {cols.map(c => (
                <th key={c.header} className={cn(MUTED_TABLE_HEAD_CLS, 'px-3 bg-muted')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.rowIndex} className="border-b border-border-faint even:bg-muted">
                {cols.map(c => (
                  <td key={c.header} className={`px-3 py-2 ${c.className ?? 'text-foreground'}`}>
                    {c.cell(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Results area */}
      {results && (
        <div className="space-y-3 px-6 py-4">
          {sessionExpired ? (
            <div className="flex items-start gap-3 rounded-lg border border-error-border bg-error-bg p-3.5">
              <p className="flex-1 text-xs text-error">
                Your APIC session has expired. Please reconnect to continue.
              </p>
              <button
                type="button"
                onClick={onReconnect}
                className="shrink-0 text-xs font-semibold text-primary transition-colors hover:text-primary/90"
              >
                Reconnect →
              </button>
            </div>
          ) : (
            <>
              {/* Summary + action button */}
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-xs text-subtle">
                    {actionableCount} {cfg.countLabel}
                    {skippedCount > 0 && ` · ${skippedCount} ${cfg.skippedLabel.toLowerCase()}`}
                    {errorCount > 0 && ` · ${errorCount} error${errorCount > 1 ? 's' : ''}`}
                  </p>
                  <button
                    type="button"
                    onClick={onChangeCSV}
                    className="text-xs text-primary transition-colors hover:text-primary/90"
                  >
                    Change CSV
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => onDeploy(actionableRows)}
                  disabled={actionableCount === 0}
                  className="whitespace-nowrap rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                >
                  {cfg.buttonVerb} {actionableCount} row{actionableCount !== 1 ? 's' : ''} →
                </button>
              </div>

              {/* Collapsible issues panel */}
              {hasIssues && (
                <div className="overflow-hidden rounded-lg border border-subtle">
                  <button
                    type="button"
                    onClick={() => setIssuesOpen((o) => !o)}
                    className="flex w-full items-center justify-between px-3.5 py-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  >
                    <span className="font-medium">
                      {issueRows.length} issue{issueRows.length !== 1 ? 's' : ''}
                      <span className="ml-1.5 font-normal text-subtle">
                        {[
                          errorCount > 0 && `${errorCount} error${errorCount > 1 ? 's' : ''}`,
                          skippedCount > 0 && `${skippedCount} ${cfg.skippedLabel.toLowerCase()}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="text-subtle">
                      <ChevronIcon open={issuesOpen} />
                    </span>
                  </button>

                  <div
                    className={cn(
                      'overflow-hidden transition-[max-height] duration-200 ease-in-out',
                      issuesOpen ? 'max-h-[9999px]' : 'max-h-0',
                    )}
                  >
                    <div className="px-3.5 pt-0.5 pb-1">
                      {issueRows
                        .filter((x) => x.result.status === 'error')
                        .map(({ row, result }) => (
                          <IssueRow
                            key={row.rowIndex}
                            label={labelFn(row)}
                            result={result}
                            skippedLabel={cfg.skippedLabel}
                          />
                        ))}
                      {issueRows
                        .filter((x) => x.result.status === cfg.skippedStatus)
                        .map(({ row, result }) => (
                          <IssueRow
                            key={row.rowIndex}
                            label={labelFn(row)}
                            result={result}
                            skippedLabel={cfg.skippedLabel}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
