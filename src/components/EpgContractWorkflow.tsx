'use client'

import { useState } from 'react'
import { DeploySection } from '@/components/DeploySection'
import { PreviewSection, type PreviewColumn } from '@/components/PreviewSection'
import { UploadSection } from '@/components/UploadSection'
import {
  EPG_ONLY_REQUIRED_COLUMNS_HELP,
  EPG_REQUIRED_COLUMNS_HELP,
  validateEpgContractCsv,
  validateEpgCsv,
} from '@/lib/apic/epgs/csv'
import type {
  EpgContractRole,
  ParsedAnyEpgRow,
} from '@/lib/apic/epgs/types'
import type { CsvValidationError } from '@/lib/apic/types'

type Step = 1 | 2 | 3
type Mode = 'deploy' | 'rollback'
type EpgValidator = (
  rawRows: Record<string, string>[],
  headers: string[],
) => { rows: ParsedAnyEpgRow[]; errors: CsvValidationError[] }

interface StepDef {
  n: Step
  label: string
  sub: string
}

const INPUT_CLS =
  'w-full bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg px-3.5 py-2.5 ' +
  'text-sm text-[var(--text)] placeholder-[var(--text-faint)] outline-none ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/10 transition-all'

const LABEL_CLS =
  'block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5'

const EPG_COLUMNS: PreviewColumn<ParsedAnyEpgRow>[] = [
  { header: '#', cell: (_r, i) => i + 1, className: 'font-mono text-[var(--text-faint)] tabular-nums select-none' },
  { header: 'Tenant', cell: r => r.tenant, className: 'text-[var(--text)]' },
  { header: 'ANP', cell: r => r.anp, className: 'font-mono text-[var(--text)]' },
  { header: 'EPG', cell: r => r.epg, className: 'font-mono text-[var(--text)]' },
  { header: 'Bridge Domain', cell: r => r.bd, className: 'font-mono text-[var(--text)]' },
  { header: 'Description', cell: r => r.epg_desc ?? '', className: 'text-[var(--text-subtle)]' },
]

const CONTRACT_COLUMNS: PreviewColumn<ParsedAnyEpgRow>[] = [
  ...EPG_COLUMNS.slice(0, 5),
  { header: 'Contract', cell: r => 'contract' in r ? r.contract : '', className: 'font-mono text-[var(--text)]' },
  EPG_COLUMNS[5],
]

function rowLabel(row: ParsedAnyEpgRow): string {
  return 'contract' in row
    ? `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.epg} -> ${row.contract}`
    : `Row ${row.rowIndex} - ${row.tenant}/${row.anp}/${row.epg}`
}

function roleLabel(role?: EpgContractRole): string {
  if (role === 'consumer') return 'Consumer'
  if (role === 'provider') return 'Provider'
  return 'EPG'
}

function featureFor(
  mode: Mode,
  role?: EpgContractRole,
): 'epg' | 'epg-consumer' | 'epg-provider' | 'epg-consumer-contract' | 'epg-provider-contract' {
  if (mode === 'rollback') {
    if (role === 'consumer') return 'epg-consumer-contract'
    if (role === 'provider') return 'epg-provider-contract'
    return 'epg'
  }
  if (!role) return 'epg'
  return role === 'provider' ? 'epg-provider' : 'epg-consumer'
}

export function EpgContractWorkflow({
  mode,
  role,
}: {
  mode: Mode
  role?: EpgContractRole
}) {
  const isRollback = mode === 'rollback'
  const isContractWorkflow = Boolean(role)
  const label = roleLabel(role)
  const feature = featureFor(mode, role)
  const validator = (isContractWorkflow ? validateEpgContractCsv : validateEpgCsv) as EpgValidator
  const step3: StepDef = isRollback
    ? { n: 3, label: 'Rollback', sub: role ? `Remove ${label.toLowerCase()} contract relations` : 'Remove EPGs from fabric' }
    : { n: 3, label: 'Deploy', sub: role ? `Create EPGs and attach ${label.toLowerCase()} contracts` : 'Create EPGs without contract attachments' }
  const steps: StepDef[] = [
    { n: 1, label: 'Upload', sub: 'Parse and validate CSV' },
    { n: 2, label: 'Review', sub: 'Check against APIC state' },
    step3,
  ]

  const [step, setStep] = useState<Step>(1)
  const [csvRows, setCsvRows] = useState<ParsedAnyEpgRow[]>([])
  const [deployRows, setDeployRows] = useState<ParsedAnyEpgRow[]>([])

  const [host, setHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedApic, setSelectedApic] = useState<{ host: string; token: string } | null>(null)
  const [apicLoading, setApicLoading] = useState(false)
  const [apicError, setApicError] = useState<string | null>(null)

  function handleUploaded(rows: ParsedAnyEpgRow[]) {
    setCsvRows(rows)
    setStep(2)
  }

  function handleDeploy(rows: ParsedAnyEpgRow[]) {
    setDeployRows(rows)
    setStep(3)
  }

  function handleGoToUpload() {
    setCsvRows([])
    setDeployRows([])
    setStep(1)
  }

  function handleReconnect() {
    setSelectedApic(null)
    setStep(1)
    setCsvRows([])
    setDeployRows([])
  }

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    setApicLoading(true)
    setApicError(null)
    try {
      const res = await fetch('/api/apic/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: host.trim(), username: username.trim(), password }),
      })
      const data = await res.json() as { token?: string; host?: string; error?: string }
      if (!res.ok || data.error) {
        setApicError(data.error ?? 'Failed to connect to APIC')
        return
      }
      if (data.token && data.host) {
        setSelectedApic({ host: data.host, token: data.token })
        setPassword('')
      }
    } catch {
      setApicError('Network error - please try again')
    } finally {
      setApicLoading(false)
    }
  }

  const pageBadge = isRollback
    ? role ? `${label} Contract Rollback` : 'EPG Rollback'
    : role ? `EPG ${label}` : 'EPG'
  const title = role ? 'EPG Contracts' : 'EPG'
  const pageSubtitle = isRollback
    ? role
      ? `Remove ${label.toLowerCase()} contract attachments after validating the expected EPG and BD`
      : 'Remove EPGs after validating the expected BD relation'
    : role
      ? `Create EPGs and attach ${label.toLowerCase()} contracts from CSV`
      : 'Create EPGs and attach them to bridge domains without contracts'

  const stepSummaries: Partial<Record<number, string>> = {
    1: csvRows.length > 0 ? `${csvRows.length} rows` : undefined,
    2: deployRows.length > 0 ? `${deployRows.length} ${isRollback ? 'to remove' : 'queued'}` : undefined,
  }

  return (
    <div className="min-h-full bg-[var(--bg)]">
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="px-8 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[18px] font-semibold text-[var(--text)] leading-tight">
                {title}
              </h1>
              <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--text-faint)] px-2 py-0.5 rounded border border-[var(--border-light)]">
                {pageBadge}
              </span>
            </div>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">{pageSubtitle}</p>
          </div>

          {selectedApic ? (
            <div className="flex items-center gap-2 shrink-0">
              <div
                style={{ background: 'var(--success-bg)', borderColor: 'var(--success-border)' }}
                className="flex items-center gap-2.5 border rounded-lg px-3 py-1.5"
              >
                <span className="relative flex shrink-0">
                  <span
                    style={{ background: 'var(--success-dot)' }}
                    className="absolute inline-flex w-2 h-2 rounded-full opacity-60 animate-ping"
                  />
                  <span
                    style={{ background: 'var(--success-dot)' }}
                    className="relative inline-flex w-2 h-2 rounded-full"
                  />
                </span>
                <div className="flex flex-col leading-tight">
                  <span
                    style={{ color: 'var(--success-text)' }}
                    className="text-[10px] font-semibold uppercase tracking-wider opacity-75"
                  >
                    Connected
                  </span>
                  <span
                    style={{ color: 'var(--success-text)' }}
                    className="text-[11px] font-mono"
                  >
                    {selectedApic.host}
                  </span>
                </div>
              </div>
              <button
                onClick={handleReconnect}
                className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-2.5 py-2 rounded-md hover:bg-[var(--surface-alt)]"
                title="Disconnect and reconnect to a different APIC"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--surface)] shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-faint)]" />
              <span className="text-xs text-[var(--text-muted)]">Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {!selectedApic && (
        <div className="px-8 py-12 sm:py-16">
          <div className="max-w-md mx-auto animate-fade-up">
            <div className="text-center mb-8">
              <div className="relative inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--surface)] border border-[var(--border)] mb-5 shadow-sm">
                <div
                  aria-hidden
                  className="absolute -inset-1.5 rounded-[18px] border border-dashed border-[var(--border)] opacity-60"
                />
                <svg
                  width="24" height="24" viewBox="0 0 24 24" fill="none"
                  className="text-[var(--text-muted)]"
                >
                  <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 9h8M8 13h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
              <h2 className="font-serif text-[22px] font-semibold text-[var(--text)] tracking-tight">
                Connect to a fabric
              </h2>
              <p className="text-sm text-[var(--text-subtle)] mt-2 max-w-sm mx-auto">
                Enter APIC controller credentials to begin {isRollback ? 'rolling back' : 'deploying'} {role ? 'EPG contract policy' : 'EPGs'}.
              </p>
            </div>

            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-hidden">
              <form onSubmit={handleConnect} className="px-6 py-6 space-y-4">
                <div>
                  <label className={LABEL_CLS}>Host</label>
                  <input
                    type="text"
                    className={`${INPUT_CLS} font-mono`}
                    placeholder="10.0.0.1 or apic.example.com"
                    value={host}
                    onChange={e => setHost(e.target.value)}
                    required
                    autoFocus
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Username</label>
                  <input
                    type="text"
                    className={INPUT_CLS}
                    placeholder="admin"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Password</label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    placeholder="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                {apicError && (
                  <div
                    style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)', color: 'var(--error-text)' }}
                    className="border rounded-lg px-3.5 py-2.5 text-xs"
                  >
                    {apicError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={apicLoading || !host.trim() || !username.trim() || !password}
                  className="w-full bg-[var(--accent)] text-white text-sm font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50 hover:bg-[var(--accent-hover)] transition-colors flex items-center justify-center gap-2"
                >
                  {apicLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {selectedApic && (
        <div className="px-8 py-6 space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl px-5 sm:px-7 py-5 shadow-sm animate-fade-up">
            <div className="flex items-center overflow-x-auto">
              {steps.map((s, i) => {
                const isDone = step > s.n
                const isActive = step === s.n
                const isInactive = step < s.n
                const summary = stepSummaries[s.n]
                const clickable = isDone && s.n === 1
                const isLast = i === steps.length - 1

                return (
                  <div
                    key={s.n}
                    className={`flex items-center ${isLast ? 'shrink-0' : 'flex-1 min-w-0'}`}
                  >
                    <button
                      type="button"
                      onClick={clickable ? handleGoToUpload : undefined}
                      disabled={!clickable && !isActive}
                      className="flex items-center gap-3 text-left group disabled:cursor-default shrink-0"
                    >
                      <div
                        className={[
                          'w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 transition-all duration-200',
                          isActive ? 'bg-[var(--accent)] text-white shadow-sm ring-4 ring-[var(--accent)]/10' : '',
                          isDone ? 'bg-[var(--success-text)] text-white' : '',
                          isInactive ? 'bg-[var(--surface-alt)] border border-[var(--border)] text-[var(--text-faint)]' : '',
                        ].join(' ')}
                      >
                        {isDone ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M2.5 6.5L5 9L9.5 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        ) : (
                          s.n
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
                          <p
                            className={[
                              'text-sm font-semibold transition-colors',
                              isActive ? 'text-[var(--text)]' : '',
                              isDone ? `text-[var(--text)] ${clickable ? 'group-hover:text-[var(--accent)]' : ''}` : '',
                              isInactive ? 'text-[var(--text-faint)]' : '',
                            ].join(' ')}
                          >
                            {s.label}
                          </p>
                          {summary && isDone && (
                            <span className="text-[10.5px] font-mono text-[var(--text-subtle)] tabular-nums">
                              - {summary}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[var(--text-subtle)] mt-0.5 whitespace-nowrap hidden sm:block">
                          {s.sub}
                        </p>
                      </div>
                    </button>
                    {!isLast && (
                      <div
                        aria-hidden
                        className={[
                          'flex-1 h-px mx-3 sm:mx-5 min-w-[20px] transition-colors',
                          isDone ? 'bg-[var(--success-text)]/30' : 'bg-[var(--border)]',
                        ].join(' ')}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          <div
            key={step}
            className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-step-in"
          >
            {step === 1 && (
              <UploadSection<ParsedAnyEpgRow>
                onUploaded={handleUploaded}
                validator={validator}
                requiredColumnsHelp={isContractWorkflow ? EPG_REQUIRED_COLUMNS_HELP : EPG_ONLY_REQUIRED_COLUMNS_HELP}
              />
            )}
            {step === 2 && (
              <PreviewSection<ParsedAnyEpgRow>
                rows={csvRows}
                apicHost={selectedApic.host}
                apicToken={selectedApic.token}
                mode={mode}
                feature={feature}
                columns={isContractWorkflow ? CONTRACT_COLUMNS : EPG_COLUMNS}
                formatRowLabel={rowLabel}
                onDeploy={handleDeploy}
                onChangeCSV={handleGoToUpload}
                onReconnect={handleReconnect}
              />
            )}
            {step === 3 && (
              <DeploySection<ParsedAnyEpgRow>
                rows={deployRows}
                apicHost={selectedApic.host}
                apicToken={selectedApic.token}
                mode={mode}
                feature={feature}
                itemNoun={isRollback && role ? 'contract relation' : 'EPG'}
                onUploadAnother={handleGoToUpload}
                onReconnect={handleReconnect}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
