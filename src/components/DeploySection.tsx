// src/components/DeploySection.tsx
'use client'

import { useEffect, useState } from 'react'
import type { DeployResult } from '@/lib/apic/types'

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

const ENDPOINTS: Record<Feature, Partial<Record<Mode, string>>> = {
  'static-ports': {
    deploy: '/api/apic/deploy',
    rollback: '/api/apic/rollback',
  },
  'interface-selectors': {
    deploy: '/api/apic/interface-selectors/deploy',
    rollback: '/api/apic/interface-selectors/rollback',
  },
  'bridge-domains-l2': {
    deploy: '/api/apic/bridge-domains/l2/deploy',
    rollback: '/api/apic/bridge-domains/l2/rollback',
  },
  'bridge-domains-l3': {
    deploy: '/api/apic/bridge-domains/l3/deploy',
    rollback: '/api/apic/bridge-domains/l3/rollback',
  },
  'epg': {
    deploy: '/api/apic/bridge-domains/epgs/deploy',
    rollback: '/api/apic/bridge-domains/epgs/rollback',
  },
  'epg-consumer': {
    deploy: '/api/apic/bridge-domains/epgs/consumer/deploy',
  },
  'epg-provider': {
    deploy: '/api/apic/bridge-domains/epgs/provider/deploy',
  },
  'epg-contract': {
    rollback: '/api/apic/bridge-domains/epgs/rollback',
  },
  'epg-consumer-contract': {
    rollback: '/api/apic/bridge-domains/epgs/consumer/rollback',
  },
  'epg-provider-contract': {
    rollback: '/api/apic/bridge-domains/epgs/provider/rollback',
  },
}

const DEFAULT_NOUN: Record<Feature, string> = {
  'static-ports': 'static port',
  'interface-selectors': 'selector',
  'bridge-domains-l2': 'bridge domain',
  'bridge-domains-l3': 'bridge domain',
  'epg': 'EPG',
  'epg-consumer': 'EPG',
  'epg-provider': 'EPG',
  'epg-contract': 'EPG',
  'epg-consumer-contract': 'contract relation',
  'epg-provider-contract': 'contract relation',
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
    if (!endpoint) return
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      setLoading(true)
      setFetchError(null)

      fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ rows, apicHost, apicToken }),
        signal:  controller.signal,
      })
        .then(r => r.json() as Promise<{ results?: DeployResult[]; error?: string }>)
        .then(data => {
          if (controller.signal.aborted) return
          if (data.error) { setFetchError(data.error); return }
          setResults(data.results ?? [])
        })
        .catch(() => {
          if (!controller.signal.aborted) setFetchError(`${cfg.title} request failed`)
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false)
        })
    }, 0)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [rows, apicHost, apicToken, endpoint, cfg.title, feature, mode])

  const successCount   = results?.filter(r => r.success).length ?? 0
  const failCount      = results?.filter(r => !r.success).length ?? 0
  const sessionExpired = results !== null &&
    results.length > 0 &&
    results.every(r => !r.success && r.message?.includes('401'))

  if (loading) {
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-subtle">
          <h2 className="font-serif text-base font-semibold text-foreground">{cfg.title}</h2>
          <p className="text-xs text-subtle mt-0.5">
            {cfg.loadingVerb} {rows.length} {noun}{rows.length !== 1 ? 's' : ''}…
          </p>
        </div>
        <div className="p-6 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-muted-foreground">This may take a moment…</span>
        </div>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div>
        <div className="px-6 pt-6 pb-5 border-b border-subtle">
          <h2 className="font-serif text-base font-semibold text-foreground">{cfg.title}</h2>
        </div>
        <div className="space-y-3 px-6 py-5">
          <p className="text-sm text-error">{fetchError}</p>
          <button
            type="button"
            onClick={onUploadAnother}
            className="text-xs text-primary underline transition-colors hover:text-primary/90"
          >
            Upload another CSV
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Card header */}
      <div className="px-6 pt-6 pb-5 border-b border-subtle">
        <h2 className="font-serif text-base font-semibold text-foreground">{cfg.title}</h2>
        {results && !sessionExpired && (
          <p className="text-xs text-subtle mt-0.5">
            {successCount} {cfg.successVerb}{failCount > 0 ? `, ${failCount} failed` : ''}
          </p>
        )}
      </div>

      <div className="px-6 py-5">
        {results ? (
          <div className="space-y-4">
            {sessionExpired ? (
              <div className="flex items-start gap-3 rounded-lg border border-error-border bg-error-bg p-3.5">
                <p className="flex-1 text-xs text-error">
                  Your APIC session expired during {cfg.title.toLowerCase()}. Please reconnect and try again.
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
                {/* All success */}
                {successCount > 0 && failCount === 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-bg text-success">
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                        <path
                          d="M3 8l3.5 3.5L13 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      {successCount} {noun}
                      {successCount !== 1 ? 's' : ''} {cfg.successVerb} successfully
                    </p>
                  </div>
                )}

                {/* Partial success */}
                {failCount > 0 && (
                  <p className="text-sm font-medium text-foreground">
                    {successCount} {cfg.successVerb}, {failCount} failed
                  </p>
                )}

                {/* Failed rows */}
                {results
                  .filter((r) => !r.success)
                  .map((r) => (
                    <div key={r.rowIndex} className="border-l-2 border-l-error pl-3">
                      <p className="font-mono text-xs text-foreground">Row {r.rowIndex}</p>
                      <p className="mt-0.5 text-xs text-error">{r.message}</p>
                    </div>
                  ))}
              </>
            )}

            {/* Upload another */}
            <div className="pt-1">
              <button
                type="button"
                onClick={onUploadAnother}
                className="text-xs font-medium text-primary transition-colors hover:text-primary/90"
              >
                Upload another CSV →
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-subtle">Waiting…</p>
        )}
      </div>
    </div>
  )
}
