import Link from 'next/link'
import { getTargetSource, getWorkerHealth } from '@/lib/inventory/sources/query'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { formatRelativeFreshness } from '@/lib/dashboard/summary'
import { DetailSection } from '@/components/inventory/devices/detail-section'
import { UnlinkButton } from './unlink-button'

type TargetSource = Awaited<ReturnType<typeof getTargetSource>>[number]
type SourceTone = 'ok' | 'pending' | 'lost'

const TONE_DOT: Record<SourceTone, string> = {
  ok: 'bg-green-600 dark:bg-green-400',
  pending: 'bg-yellow-500 dark:bg-yellow-400',
  lost: 'bg-faint',
}

function sourceState(source: TargetSource): {
  label: string
  detail: string | null
  tone: SourceTone
} {
  const observed = source.nodeSnapshot ?? source.legacyDevice
  if (!observed) {
    return {
      label: 'Disconnected',
      detail: 'Scans no longer report this hardware. Its last accepted values are kept.',
      tone: 'lost',
    }
  }
  if (source.nodeSnapshot?.present === false) {
    return { label: 'Missing', detail: 'Not seen in the latest successful scan.', tone: 'lost' }
  }
  if (source.acceptedRevision < observed.inventoryRevision) {
    return { label: 'Pending refresh', detail: null, tone: 'pending' }
  }
  return { label: 'Linked', detail: null, tone: 'ok' }
}

// The stored label embeds the APIC host id; the live snapshot carries the
// names a reader recognises. Fall back to the label once the source is gone.
function sourceTitle(source: TargetSource): string {
  if (source.nodeSnapshot) return source.nodeSnapshot.name || `Node ${source.nodeSnapshot.nodeId}`
  if (source.legacyDevice) return source.legacyDevice.hostname
  return source.sourceLabel
}

function sourceOrigin(source: TargetSource): string | null {
  const scope = source.deviceStack ? `, whole stack ${source.deviceStack.name}` : ''
  if (source.nodeSnapshot) return `ACI fabric ${source.nodeSnapshot.apicHost.name}${scope}`
  if (source.legacyDevice) return `Legacy site ${source.legacyDevice.site}${scope}`
  return null
}

export async function SourcePanel({ deviceId }: { deviceId: string }) {
  const [sources, role] = await Promise.all([getTargetSource(deviceId), getInventoryViewerRole()])
  if (!sources.length) {
    return (
      <DetailSection title="Discovery">
        <p className="text-sm text-muted-foreground">
          Maintained by hand. Link it to a discovered device to keep serial, model and version in
          step with scans.
        </p>
        <Link
          href="/inventory/discovered"
          className="mt-2 inline-block text-xs text-primary hover:underline"
        >
          Link a discovered device
        </Link>
      </DetailSection>
    )
  }

  const health = await getWorkerHealth()
  return (
    <DetailSection title="Discovery">
      <ul className="space-y-5">
        {sources.map((source) => {
          const state = sourceState(source)
          const origin = sourceOrigin(source)
          const lastSeen =
            (source.nodeSnapshot ?? source.legacyDevice)?.lastSeenAt ?? source.lastSeenAt
          return (
            <li key={source.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {sourceTitle(source)}
                  </p>
                  {origin && <p className="mt-0.5 text-xs text-subtle">{origin}</p>}
                </div>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground">
                  <span aria-hidden className={`size-1.5 rounded-full ${TONE_DOT[state.tone]}`} />
                  {state.label}
                </span>
              </div>
              {state.detail && <p className="text-xs text-muted-foreground">{state.detail}</p>}
              <dl className="flex items-baseline justify-between gap-3 text-xs">
                <dt className="text-subtle">Last received</dt>
                <dd className="text-foreground">
                  {lastSeen ? (
                    <time dateTime={lastSeen.toISOString()} title={lastSeen.toISOString()}>
                      {formatRelativeFreshness(lastSeen)}
                    </time>
                  ) : (
                    'Not yet'
                  )}
                </dd>
              </dl>
              {source.deviceStack && (
                <div className="rounded-lg bg-muted/60 px-3 py-2.5 text-xs">
                  <p className="text-muted-foreground">
                    Reported for the whole stack. These values are not copied onto its members.
                  </p>
                  <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                    <dt className="text-subtle">Hostname</dt>
                    <dd className="truncate font-mono text-foreground">
                      {source.deviceStack.observedHostname ?? '—'}
                    </dd>
                    <dt className="text-subtle">Version</dt>
                    <dd className="truncate font-mono text-foreground">
                      {source.deviceStack.observedVersion ?? '—'}
                    </dd>
                    <dt className="text-subtle">Management IP</dt>
                    <dd className="truncate font-mono text-foreground">
                      {source.deviceStack.observedManagementIp ?? '—'}
                    </dd>
                  </dl>
                </div>
              )}
              {source.conflictReason && (
                <p
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs text-destructive"
                >
                  {source.conflictReason} Keep the original asset and add replacement hardware
                  separately, or unlink to correct a verified entry error.
                </p>
              )}
              {role === 'admin' && <UnlinkButton id={source.id} />}
            </li>
          )
        })}
      </ul>
      <p className="mt-5 border-t border-border-faint pt-3 text-xs text-subtle">
        {health.state}. {health.pending} pending, {health.failed} retrying.
      </p>
    </DetailSection>
  )
}
