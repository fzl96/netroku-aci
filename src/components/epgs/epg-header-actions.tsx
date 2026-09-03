'use client'

import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconRefresh } from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { EpgLoadState, EpgOverviewPayload } from '@/lib/epgs/query'
import { EpgRegionError } from './epg-region-error'
import { ExportEpgsDialog } from './export-epgs-dialog'

export function EpgHeaderActions({
  dataPromise,
}: {
  dataPromise: Promise<EpgLoadState<EpgOverviewPayload>>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EpgRegionError region="overview" compact />
  if (state.kind === 'inactive') return null

  const { params, hosts, overview } = state.data
  const selectedHost = hosts.find((host) => host.id === params.hostId)

  async function resync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/epgs/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = (await response.json()) as {
        syncedEpgs?: number
        syncedBindings?: number
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedEpgs} EPGs (${data.syncedBindings} port bindings)`)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <select
        value={params.hostId}
        onChange={(event) => {
          const next = event.target.value
          startTransition(() => router.replace(next ? `/epgs?apic=${next}` : '/epgs'))
        }}
        disabled={isPending}
        className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground md:min-w-[180px] md:flex-none"
      >
        <option value="">Select APIC host…</option>
        {hosts.map((host) => (
          <option key={host.id} value={host.id}>
            {host.name} ({host.host})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setCredentialOpen(true)}
        disabled={!params.hostId || syncing || isPending}
        className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
      >
        <IconRefresh size={12} className={syncing ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>
      <ExportEpgsDialog
        apicHostId={params.hostId}
        hostTotal={overview.hostTotal}
        filteredTotal={overview.filteredTotal}
        filters={{
          query: params.query,
          tenant: params.tenants,
          ap: params.appProfiles,
          node: params.nodes,
        }}
      />
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync EPGs"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={resync}
      />
    </div>
  )
}
