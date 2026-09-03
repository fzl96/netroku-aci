'use client'

import { useState } from 'react'
import { INPUT_CLS, LABEL_CLS } from '@/lib/ui-classes'

type Step = 1 | 2 | 3

export interface WorkflowStepDef {
  n: Step
  label: string
  sub: string
}

export interface WorkflowPreviewCtx<TRow> {
  rows: TRow[]
  apicHost: string
  apicToken: string
  onDeploy: (rows: TRow[]) => void
  onChangeCSV: () => void
  onReconnect: () => void
}

export interface WorkflowDeployCtx<TRow> {
  rows: TRow[]
  apicHost: string
  apicToken: string
  onUploadAnother: () => void
  onReconnect: () => void
}

interface WorkflowShellProps<TRow> {
  title: string
  badge: string
  subtitle: string
  steps: [WorkflowStepDef, WorkflowStepDef, WorkflowStepDef]
  queuedNoun: string
  connectDescription: React.ReactNode
  renderUpload: (onUploaded: (rows: TRow[]) => void) => React.ReactNode
  renderPreview: (ctx: WorkflowPreviewCtx<TRow>) => React.ReactNode
  renderDeploy: (ctx: WorkflowDeployCtx<TRow>) => React.ReactNode
}

export function WorkflowShell<TRow>({
  title,
  badge,
  subtitle,
  steps,
  queuedNoun,
  connectDescription,
  renderUpload,
  renderPreview,
  renderDeploy,
}: WorkflowShellProps<TRow>) {
  const [step, setStep] = useState<Step>(1)
  const [csvRows, setCsvRows] = useState<TRow[]>([])
  const [deployRows, setDeployRows] = useState<TRow[]>([])

  const [host, setHost] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [selectedApic, setSelectedApic] = useState<{ host: string; token: string } | null>(null)
  const [apicLoading, setApicLoading] = useState(false)
  const [apicError, setApicError] = useState<string | null>(null)

  function handleUploaded(rows: TRow[]) {
    setCsvRows(rows)
    setStep(2)
  }

  function handleDeploy(rows: TRow[]) {
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
      const data = (await res.json()) as { token?: string; host?: string; error?: string }
      if (!res.ok || data.error) {
        setApicError(data.error ?? 'Failed to connect to APIC')
        return
      }
      if (data.token && data.host) {
        setSelectedApic({ host: data.host, token: data.token })
        setPassword('')
      }
    } catch {
      setApicError('Network error — please try again')
    } finally {
      setApicLoading(false)
    }
  }

  const stepSummaries: Partial<Record<number, string>> = {
    1: csvRows.length > 0 ? `${csvRows.length} rows` : undefined,
    2: deployRows.length > 0 ? `${deployRows.length} ${queuedNoun}` : undefined,
  }

  const stepHandlers: Partial<Record<number, () => void>> = {
    1: step > 1 ? handleGoToUpload : undefined,
  }

  return (
    <div className="min-h-full bg-background">
      {/* ─── Sticky page header ─────────────────────────────────────────── */}
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center justify-between gap-4 px-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-serif text-[18px] leading-tight font-semibold text-foreground">
                {title}
              </h1>
              <span className="hidden rounded border border-subtle px-2 py-0.5 font-mono text-[10px] tracking-[0.14em] text-faint uppercase sm:inline-block">
                {badge}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-subtle">{subtitle}</p>
          </div>

          {selectedApic ? (
            <div className="flex shrink-0 items-center gap-2">
              <div className="flex items-center gap-2.5 rounded-lg border border-success-border bg-success-bg px-3 py-1.5">
                <span className="relative flex shrink-0">
                  <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-success-dot opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success-dot" />
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-[10px] font-semibold tracking-wider text-success uppercase opacity-75">
                    Connected
                  </span>
                  <span className="font-mono text-[11px] text-success">{selectedApic.host}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReconnect}
                className="rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Disconnect and reconnect to a different APIC"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-2 rounded-lg border border-subtle bg-card px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-faint" />
              <span className="text-xs text-muted-foreground">Disconnected</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── APIC not connected: connect form ───────────────────────────── */}
      {!selectedApic && (
        <div className="px-8 py-12 sm:py-16">
          <div className="animate-fade-up mx-auto max-w-md">
            <div className="mb-8 text-center">
              <div className="relative mb-5 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                <div
                  aria-hidden
                  className="absolute -inset-1.5 rounded-[18px] border border-dashed border-border opacity-60"
                />
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  className="text-muted-foreground"
                >
                  <rect
                    x="3"
                    y="4"
                    width="18"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <rect
                    x="3"
                    y="13"
                    width="18"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  />
                  <circle cx="6.5" cy="7.5" r="0.85" fill="currentColor" />
                  <circle cx="6.5" cy="16.5" r="0.85" fill="currentColor" />
                  <path
                    d="M10 7.5h8M10 16.5h8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <h2 className="font-serif text-[22px] font-semibold tracking-tight text-foreground">
                Connect to a fabric
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-subtle">{connectDescription}</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <form onSubmit={handleConnect} className="space-y-4 px-6 py-6">
                <div>
                  <label className={LABEL_CLS}>Host</label>
                  <input
                    type="text"
                    className={`${INPUT_CLS} font-mono`}
                    placeholder="10.0.0.1 or apic.example.com"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
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
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Password</label>
                  <input
                    type="password"
                    className={INPUT_CLS}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                {apicError && (
                  <div className="rounded-lg border border-error-border bg-error-bg px-3.5 py-2.5 text-xs text-error">
                    {apicError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={apicLoading || !host.trim() || !username.trim() || !password}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {apicLoading ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Connecting…
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

      {/* ─── APIC connected: workflow ───────────────────────────────────── */}
      {selectedApic && (
        <div className="space-y-5 px-8 py-6">
          {/* Stepper */}
          <div className="animate-fade-up rounded-2xl border border-border bg-card px-5 py-5 shadow-sm sm:px-7">
            <div className="flex items-center overflow-x-auto">
              {steps.map((s, i) => {
                const isDone = step > s.n
                const isActive = step === s.n
                const isInactive = step < s.n
                const summary = stepSummaries[s.n]
                const handler = stepHandlers[s.n]
                const clickable = isDone && !!handler
                const isLast = i === steps.length - 1

                return (
                  <div
                    key={s.n}
                    className={`flex items-center ${isLast ? 'shrink-0' : 'min-w-0 flex-1'}`}
                  >
                    <button
                      type="button"
                      onClick={clickable ? handler : undefined}
                      disabled={!clickable && !isActive}
                      className="group flex shrink-0 items-center gap-3 text-left disabled:cursor-default"
                    >
                      <div
                        className={[
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-all duration-200',
                          isActive
                            ? 'bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/10'
                            : '',
                          isDone ? 'bg-success text-success-foreground' : '',
                          isInactive ? 'border border-border bg-muted text-faint' : '',
                        ].join(' ')}
                      >
                        {isDone ? (
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2.5 6.5L5 9L9.5 3"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
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
                              isActive ? 'text-foreground' : '',
                              isDone
                                ? `text-foreground ${clickable ? 'group-hover:text-primary' : ''}`
                                : '',
                              isInactive ? 'text-faint' : '',
                            ].join(' ')}
                          >
                            {s.label}
                          </p>
                          {summary && isDone && (
                            <span className="font-mono text-[10.5px] text-subtle tabular-nums">
                              · {summary}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 hidden text-[11px] whitespace-nowrap text-subtle sm:block">
                          {s.sub}
                        </p>
                      </div>
                    </button>
                    {!isLast && (
                      <div
                        aria-hidden
                        className={[
                          'mx-3 h-px min-w-[20px] flex-1 transition-colors sm:mx-5',
                          isDone ? 'bg-success/30' : 'bg-border',
                        ].join(' ')}
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Step content */}
          <div
            key={step}
            className="animate-step-in overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
          >
            {step === 1 && renderUpload(handleUploaded)}
            {step === 2 &&
              renderPreview({
                rows: csvRows,
                apicHost: selectedApic.host,
                apicToken: selectedApic.token,
                onDeploy: handleDeploy,
                onChangeCSV: handleGoToUpload,
                onReconnect: handleReconnect,
              })}
            {step === 3 &&
              renderDeploy({
                rows: deployRows,
                apicHost: selectedApic.host,
                apicToken: selectedApic.token,
                onUploadAnother: handleGoToUpload,
                onReconnect: handleReconnect,
              })}
          </div>
        </div>
      )}
    </div>
  )
}
