// src/components/DeploySection.tsx
'use client'

import { useEffect, useState } from 'react'
import type { DeployResult } from '@/lib/apic/types'

type Mode = 'deploy' | 'rollback'
type Feature = 'static-ports' | 'interface-selectors'

interface DeploySectionProps<TRow extends { rowIndex: number }> {
  rows: TRow[]
  apicHost: string
  apicToken: string
  mode?: Mode
  feature?: Feature
  itemNoun?: string
  onUploadAnother: () => void
  onReconnect: () => void
}

const ENDPOINTS: Record<Feature, Record<Mode, string>> = {
  'static-ports': {
    deploy: '/api/apic/deploy',
    rollback: '/api/apic/rollback',
  },
  'interface-selectors': {
    deploy: '/api/apic/interface-selectors/deploy',
    rollback: '/api/apic/interface-selectors/rollback',
  },
}

const DEFAULT_NOUN: Record<Feature, string> = {
  'static-ports': 'static port',
  'interface-selectors': 'selector',
}

const MODE_CONFIG: Record<Mode, {
  title: string
  loadingVerb: string
  successVerb: string
}> = {
  deploy: {
    title: 'Deploy',
    loadingVerb: 'Deploying',
    successVerb: 'deployed',
  },
  rollback: {
    title: 'Rollback',
    loadingVerb: 'Removing',
    successVerb: 'removed',
  },
}

export function DeploySection<TRow extends { rowIndex: number }>({
  rows,
  apicHost,
  apicToken,
  mode = 'deploy',
  feature = 'static-ports',
  itemNoun,
  onUploadAnother,
  onReconnect,
}: DeploySectionProps<TRow>) {
  const cfg = MODE_CONFIG[mode]
  const endpoint = ENDPOINTS[feature][mode]
  const noun = itemNoun ?? DEFAULT_NOUN[feature]

  const [results, setResults]       = useState<DeployResult[] | null>(null)
  const [loading, setLoading]       = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (rows.length === 0) return
    setLoading(true)
    setFetchError(null)

    fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows, apicHost, apicToken }),
    })
      .then(r => r.json() as Promise<{ results?: DeployResult[]; error?: string }>)
      .then(data => {
        if (data.error) { setFetchError(data.error); return }
        setResults(data.results ?? [])
      })
      .catch(() => setFetchError(`${cfg.title} request failed`))
      .finally(() => setLoading(false))
  }, [rows, apicHost, apicToken, endpoint, cfg.title])

  const successCount   = results?.filter(r => r.success).length ?? 0
  const failCount      = results?.filter(r => !r.success).length ?? 0
  const sessionExpired = results !== null &&
    results.length > 0 &&
    results.every(r => !r.success && r.message?.includes('401'))

  if (loading) {
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
          <h2 className="font-serif text-base font-semibold text-[var(--text)]">{cfg.title}</h2>
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {cfg.loadingVerb} {rows.length} {noun}{rows.length !== 1 ? 's' : ''}…
          </p>
        </div>
        <div className="p-6 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-[var(--text-muted)]">This may take a moment…</span>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
          <h2 className="font-serif text-base font-semibold text-[var(--text)]">{cfg.title}</h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p style={{ color: 'var(--error-text)' }} className="text-sm">{fetchError}</p>
          <button onClick={onUploadAnother}
            className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors underline">
            Upload another CSV
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Card header */}
      <div className="px-6 pt-6 pb-5 border-b border-[var(--border-light)]">
        <h2 className="font-serif text-base font-semibold text-[var(--text)]">{cfg.title}</h2>
        {results && !sessionExpired && (
          <p className="text-xs text-[var(--text-subtle)] mt-0.5">
            {successCount} {cfg.successVerb}{failCount > 0 ? `, ${failCount} failed` : ''}
          </p>
        )}
      </div>

      <div className="px-6 py-5">
        {results ? (
          <div className="space-y-4">
            {sessionExpired ? (
              <div
                style={{ background: 'var(--error-bg)', borderColor: 'var(--error-border)' }}
                className="flex items-start gap-3 p-3.5 border rounded-lg"
              >
                <p style={{ color: 'var(--error-text)' }} className="text-xs flex-1">
                  Your APIC session expired during {cfg.title.toLowerCase()}. Please reconnect and try again.
                </p>
                <button onClick={onReconnect}
                  className="text-xs font-semibold text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors shrink-0">
                  Reconnect →
                </button>
              </div>
            ) : (
              <>
                {/* All success */}
                {successCount > 0 && failCount === 0 && (
                  <div className="flex items-center gap-3">
                    <div
                      style={{ background: 'var(--success-bg)' }}
                      className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                        style={{ color: 'var(--success-text)' }}>
                        <path d="M3 8l3.5 3.5L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-[var(--text)]">
                      {successCount} {noun}{successCount !== 1 ? 's' : ''} {cfg.successVerb} successfully
                    </p>
                  </div>
                )}

                {/* Partial success */}
                {failCount > 0 && (
                  <p className="text-sm font-medium text-[var(--text)]">
                    {successCount} {cfg.successVerb}, {failCount} failed
                  </p>
                )}

                {/* Failed rows */}
                {results.filter(r => !r.success).map(r => (
                  <div key={r.rowIndex} className="border-l-2 border-l-[var(--error-text)] pl-3">
                    <p className="text-xs font-mono text-[var(--text)]">Row {r.rowIndex}</p>
                    <p style={{ color: 'var(--error-text)' }} className="text-xs mt-0.5">{r.message}</p>
                  </div>
                ))}
              </>
            )}

            {/* Upload another */}
            <div className="pt-1">
              <button
                onClick={onUploadAnother}
                className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
              >
                Upload another CSV →
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-subtle)]">Waiting…</p>
        )}
      </div>
    </div>
  )
}
