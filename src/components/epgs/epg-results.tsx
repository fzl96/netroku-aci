'use client'

import { use, useState } from 'react'
import type { EpgLoadState, EpgResultsPayload } from '@/lib/epgs/query'
import type { EpgPortSummary } from '@/lib/epgs/sort'
import { EpgDetailPanel } from './epg-detail-panel'
import { EpgPortDetailPanel } from './epg-port-detail-panel'
import { EpgRegionError } from './epg-region-error'
import { EpgTable } from './epg-table'

export function EpgResults({
  dataPromise,
}: {
  dataPromise: Promise<EpgLoadState<EpgResultsPayload>>
}) {
  const [epgId, setEpgId] = useState<string | null>(null)
  const [port, setPort] = useState<EpgPortSummary | null>(null)
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EpgRegionError region="results" />
  if (state.kind === 'inactive') return null

  const { params, results } = state.data
  const noun = results.view === 'epg' ? 'EPGs' : 'ports'
  const filtered = Boolean(
    params.query || params.tenants.length || params.appProfiles.length || params.nodes.length,
  )
  const selectedEpg =
    results.view === 'epg' ? (results.rows.find((row) => row.id === epgId) ?? null) : null

  return (
    <section className="space-y-3">
      {results.rows.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-subtle">
              {filtered ? `No ${noun} match the current filters` : `No ${noun} found`}
            </p>
            <p className="mt-1 text-xs text-faint">
              {filtered
                ? 'Try adjusting the search or filter values'
                : 'Click Resync to pull the latest data from the APIC'}
            </p>
          </div>
        </div>
      ) : (
        <EpgTable params={params} results={results} onEpgSelect={setEpgId} onPortSelect={setPort} />
      )}
      <EpgDetailPanel epg={selectedEpg} onClose={() => setEpgId(null)} />
      <EpgPortDetailPanel port={port} onClose={() => setPort(null)} />
    </section>
  )
}
