// src/components/PreviewSection.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import type { ParsedRow, ValidationResult, RowStatus } from '@/lib/apic/types'

type Mode = 'deploy' | 'rollback'
type Feature = 'static-ports' | 'interface-selectors'

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

const ENDPOINTS: Record<Feature, Record<Mode, string>> = {
  'static-ports': {
    deploy: '/api/apic/validate',
    rollback: '/api/apic/validate-rollback',
  },
  'interface-selectors': {
    deploy: '/api/apic/interface-selectors/validate',
    rollback: '/api/apic/interface-selectors/validate-rollback',
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
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-[var(--text-faint)] tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-[var(--text)]' },
  { header: 'AP', cell: r => r.ap, className: 'text-[var(--text)]' },
  { header: 'EPG', cell: r => r.epg, className: 'text-[var(--text)]' },
  { header: 'VLAN', cell: r => r.vlan, className: 'font-mono text-[var(--text)]' },
  { header: 'Nodes', cell: r => r.node2 ? `${r.node1} / ${r.node2}` : r.node1, className: 'font-mono text-[var(--text)]' },
  { header: 'Type', cell: r => r.port_type, className: 'text-[var(--text)]' },
  { header: 'Interface / IPG', cell: r => r.interface_or_ipg, className: 'font-mono text-[var(--text)]' },
  { header: 'Mode', cell: r => r.mode, className: 'text-[var(--text)]' },
]

function staticPortLabel(r: ParsedRow): string {
  return `Row ${r.rowIndex} — ${r.tenant}/${r.ap}/${r.epg} · VLAN ${r.vlan}`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 12 12" fill="none"
      className="transition-transform duration-200"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <path d="M2 4.5L6 8l4-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
    <div className="flex items-start gap-3 py-2 border-b border-[var(--border-lighter)] last:border-0">
      <span
        style={isError
          ? { background: 'var(--error-bg)', color: 'var(--error-text)' }
          : { background: 'var(--warning-bg)', color: 'var(--warning-text)' }
        }
        className="mt-0.5 shrink-0 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-sm"
      >
        {isError ? 'Error' : skippedLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-[var(--text)] font-medium truncate font-mono">
          {label}
        </p>
        {result.message && (
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">{result.message}</p>
        )}
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
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (rows.length === 0) return
    setLoading(true)
    setFetchError(null)
    setIssuesOpen(false)

    fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows, apicHost, apicToken }),
    })
      .then(r => r.json() as Promise<{ results?: ValidationResult[]; error?: string }>)
      .then(data => {
        if (data.error) { setFetchError(data.error); return }
        setResults(data.results ?? [])
      })
      .catch(() => setFetchError('Validation request failed'))
      .finally(() => setLoading(false))
  }, [rows, apicHost, apicToken, endpoint])

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
        <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
          <h2 className="font-serif text-base font-semibold text-[var(--text)]">Preview & Validate</h2>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">Checking {rows.length} rows against APIC…</p>
        </div>
        <div className="px-6 py-4 space-y-2.5">
          {Array.from({ length: Math.min(rows.length, 5) }).map((_, i) => (
            <div key={i} className="flex gap-4 animate-pulse">
              <div className="h-3 bg-[var(--border)] rounded w-20" />
              <div className="h-3 bg-[var(--border)] rounded w-24" />
              <div className="h-3 bg-[var(--border)] rounded w-16" />
              <div className="h-3 bg-[var(--border)] rounded w-10" />
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
        <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
          <h2 className="font-serif text-base font-semibold text-[var(--text)]">Preview & Validate</h2>
        </div>
        <div className="px-6 py-5">
          {isExpired ? (
            <div
              style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}
              className="flex items-start gap-3 p-3.5 border rounded-lg"
            >
              <p style={{ color: 'var(--error-text)' }} className="text-xs flex-1">
                Your APIC session has expired. Please reconnect to continue.
              </p>
              <button onClick={onReconnect}
                className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors shrink-0">
                Reconnect →
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--error-text)' }} className="text-sm">{fetchError}</p>
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
      <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
        <h2 className="font-serif text-base font-semibold text-[var(--text)]">Preview & Validate</h2>
        {results && (
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {rows.length} row{rows.length !== 1 ? 's' : ''} loaded
          </p>
        )}
      </div>

      {/* Table — height-capped so the header card stays visible; thead is sticky within */}
      <div className="overflow-auto max-h-[calc(100svh-360px)] min-h-[200px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-light)] bg-[var(--surface-alt)]">
              {cols.map(c => (
                <th key={c.header} className="text-left px-3 py-2.5 text-[10px] uppercase tracking-wide font-semibold text-[var(--text-subtle)] whitespace-nowrap bg-[var(--surface-alt)]">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.rowIndex} className="border-b border-[var(--border-lighter)] even:bg-[var(--surface-alt)]">
                {cols.map(c => (
                  <td key={c.header} className={`px-3 py-2 ${c.className ?? 'text-[var(--text)]'}`}>
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
        <div className="px-6 py-4 space-y-3">
          {sessionExpired ? (
            <div
              style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}
              className="flex items-start gap-3 p-3.5 border rounded-lg"
            >
              <p style={{ color: 'var(--error-text)' }} className="text-xs flex-1">
                Your APIC session has expired. Please reconnect to continue.
              </p>
              <button onClick={onReconnect}
                className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors shrink-0">
                Reconnect →
              </button>
            </div>
          ) : (
            <>
              {/* Summary + action button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-xs text-[var(--text-subtle)]">
                    {actionableCount} {cfg.countLabel}
                    {skippedCount > 0 && ` · ${skippedCount} ${cfg.skippedLabel.toLowerCase()}`}
                    {errorCount > 0 && ` · ${errorCount} error${errorCount > 1 ? 's' : ''}`}
                  </p>
                  <button
                    onClick={onChangeCSV}
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
                  >
                    Change CSV
                  </button>
                </div>
                <button
                  onClick={() => onDeploy(actionableRows)}
                  disabled={actionableCount === 0}
                  className="bg-[var(--accent)] text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-40 hover:bg-[var(--accent-hover)] transition-colors whitespace-nowrap"
                >
                  {cfg.buttonVerb} {actionableCount} row{actionableCount !== 1 ? 's' : ''} →
                </button>
              </div>

              {/* Collapsible issues panel */}
              {hasIssues && (
                <div className="border border-[var(--border-light)] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setIssuesOpen(o => !o)}
                    className="w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface-alt)] transition-colors"
                  >
                    <span className="font-medium">
                      {issueRows.length} issue{issueRows.length !== 1 ? 's' : ''}
                      <span className="font-normal text-[var(--text-subtle)] ml-1.5">
                        {[
                          errorCount   > 0 && `${errorCount} error${errorCount > 1 ? 's' : ''}`,
                          skippedCount > 0 && `${skippedCount} ${cfg.skippedLabel.toLowerCase()}`,
                        ].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="text-[var(--text-subtle)]">
                      <ChevronIcon open={issuesOpen} />
                    </span>
                  </button>

                  <div
                    ref={contentRef}
                    style={{
                      maxHeight: issuesOpen ? (contentRef.current?.scrollHeight ?? 9999) : 0,
                      overflow: 'hidden',
                      transition: 'max-height 220ms ease',
                    }}
                  >
                    <div className="px-3.5 pb-1 pt-0.5">
                      {issueRows.filter(x => x.result.status === 'error').map(({ row, result }) => (
                        <IssueRow key={row.rowIndex} label={labelFn(row)} result={result} skippedLabel={cfg.skippedLabel} />
                      ))}
                      {issueRows.filter(x => x.result.status === cfg.skippedStatus).map(({ row, result }) => (
                        <IssueRow key={row.rowIndex} label={labelFn(row)} result={result} skippedLabel={cfg.skippedLabel} />
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
