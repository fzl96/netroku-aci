'use client'

import { use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { IconDownload, IconRefresh } from '@tabler/icons-react'
import { useApicHosts } from '@/components/ApicHostsProvider'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'

function HostSelect({
  params,
  className,
}: {
  params: InterfaceHealthPageParams
  className: string
}) {
  const apicHosts = useApicHosts()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  return (
    <select
      value={params.hostId}
      onChange={(e) => {
        const next = e.target.value
          ? `/interface-health?apic=${e.target.value}`
          : '/interface-health'
        startTransition(() => router.replace(next))
      }}
      disabled={isPending}
      className={className}
    >
      <option value="">Select APIC host…</option>
      {apicHosts.map((h) => (
        <option key={h.id} value={h.id}>
          {h.name} ({h.host})
        </option>
      ))}
    </select>
  )
}

export function InterfaceHeaderActions({
  paramsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
}) {
  const params = use(paramsPromise)
  const apicHosts = useApicHosts()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const selectedHost = apicHosts.find((host) => host.id === params.hostId)
  const loading = isPending || syncing

  async function handleResync(credentials: { username: string; password: string }) {
    if (!params.hostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/interfaces/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: params.hostId, ...credentials }),
      })
      const data = (await res.json()) as { synced?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.synced} interfaces (${data.total} total)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function handleExport() {
    if (!params.hostId) return
    setExporting(true)
    try {
      const res = await fetch('/api/interfaces/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apicHostId: params.hostId,
          node: params.nodes.length > 0 ? params.nodes : undefined,
        }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const disposition = res.headers.get('Content-Disposition') ?? ''
      const m = /filename="([^"]+)"/.exec(disposition)
      link.download = m?.[1] ?? 'interfaces.csv'
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="flex w-full items-center gap-2 md:w-auto">
      <HostSelect
        params={params}
        className={[
          'rounded-lg border border-border bg-muted text-xs',
          'px-3 py-2 text-foreground outline-none',
          'focus:border-primary focus:ring-2 focus:ring-primary/10',
          'min-w-0 flex-1 md:min-w-[180px] md:flex-none',
          'transition-opacity disabled:cursor-not-allowed disabled:opacity-60',
        ].join(' ')}
      />

      <button
        onClick={() => setCredentialOpen(true)}
        disabled={!params.hostId || syncing}
        title="Resync interfaces from APIC"
        className={[
          'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm transition-colors',
          params.hostId && !syncing
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'cursor-not-allowed bg-muted text-faint',
        ].join(' ')}
      >
        <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
        {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
      </button>

      <button
        onClick={handleExport}
        disabled={!params.hostId || exporting}
        title="Export interface samples to CSV"
        className={[
          'flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors',
          params.hostId && !exporting
            ? 'border-border text-foreground hover:bg-muted'
            : 'cursor-not-allowed border-border text-faint',
        ].join(' ')}
      >
        <IconDownload size={12} stroke={1.75} />
        {exporting ? 'Exporting…' : 'Export'}
      </button>

      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync interfaces"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
