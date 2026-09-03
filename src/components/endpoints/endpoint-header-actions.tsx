'use client'

import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconRefresh } from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { EndpointLoadState, EndpointOverviewPayload } from '@/lib/endpoints/query'
import { EndpointRegionError } from './endpoint-region-error'
import { ExportEndpointsDialog } from './export-endpoints-dialog'

export function EndpointHeaderActions({
  dataPromise,
}: {
  dataPromise: Promise<EndpointLoadState<EndpointOverviewPayload>>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <EndpointRegionError region="overview" compact />
  if (state.kind === 'inactive') return null

  const { params, hosts, overview, filteredTotal } = state.data
  const selectedHost = hosts.find((host) => host.id === params.hostId)

  async function handleResync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/endpoints/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = (await response.json()) as { synced?: number; total?: number; error?: string }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} active endpoints (${data.total} total with history)`)
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
          startTransition(() =>
            router.replace(next ? `/endpoints?apic=${next}` : '/endpoints', { scroll: false }),
          )
        }}
        disabled={isPending}
        className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground transition-opacity outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-60 md:min-w-[180px] md:flex-none"
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
        title="Resync endpoints from APIC"
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors ${params.hostId && !syncing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed bg-muted text-faint'}`}
      >
        <IconRefresh
          size={12}
          stroke={1.75}
          className={syncing || isPending ? 'animate-spin' : ''}
        />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>
      <ExportEndpointsDialog
        apicHostId={params.hostId}
        hostTotal={overview.activeTotal + overview.historicalTotal}
        filteredTotal={filteredTotal}
        filters={{
          query: params.query,
          vlan: params.vlans,
          node: params.nodes,
          iface: params.interfaces,
          status: params.statuses,
        }}
      />
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync endpoints"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
