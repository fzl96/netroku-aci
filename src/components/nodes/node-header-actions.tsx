'use client'

import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconRefresh } from '@tabler/icons-react'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { NodeLoadState, NodeOverviewPayload } from '@/lib/nodes/query'
import { NodeRegionError } from './node-region-error'

function fmtRelative(value: string | null): string {
  if (!value) return 'never'
  const minutes = Math.floor((Date.now() - new Date(value).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`
}

export function NodeHeaderActions({
  dataPromise,
}: {
  dataPromise: Promise<NodeLoadState<NodeOverviewPayload>>
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <NodeRegionError region="overview" compact />
  if (state.kind === 'inactive') return null

  const { params, hosts, overview } = state.data
  const selectedHost = hosts.find((host) => host.id === params.hostId)

  async function handleResync(credentials: { username: string; password: string }) {
    setSyncing(true)
    try {
      const response = await fetch('/api/nodes/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = (await response.json()) as {
        syncedNodes?: number
        syncedComponents?: number
        error?: string
      }
      if (!response.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedNodes} nodes, ${data.syncedComponents} components`)
      startTransition(() => router.refresh())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <span className="hidden text-xs text-subtle lg:inline">
        Last synced {fmtRelative(overview.lastNodeSyncAt)}
      </span>
      <select
        value={params.hostId}
        onChange={(event) =>
          startTransition(() =>
            router.replace(event.target.value ? `/nodes?apic=${event.target.value}` : '/nodes'),
          )
        }
        disabled={isPending}
        className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-60 md:min-w-[180px] md:flex-none"
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
        disabled={!params.hostId || syncing}
        title="Resync nodes from APIC"
        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm ${params.hostId && !syncing ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'cursor-not-allowed bg-muted text-faint'}`}
      >
        <IconRefresh size={12} className={syncing || isPending ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>
      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync nodes"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
