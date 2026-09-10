import Link from 'next/link'
import { getTargetSource, getWorkerHealth } from '@/lib/inventory/sources/query'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { UnlinkButton } from './unlink-button'
export async function SourcePanel({ deviceId }: { deviceId: string }) {
  const [sources, role] = await Promise.all([getTargetSource(deviceId), getInventoryViewerRole()])
  if (!sources.length)
    return (
      <p className="text-sm text-muted-foreground">
        Manually maintained asset.{' '}
        <Link className="text-primary underline" href="/inventory/discovered">
          Link a discovery
        </Link>{' '}
        to refresh technical fields automatically.
      </p>
    )
  const health = await getWorkerHealth()
  return (
    <section className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="font-semibold">Discovery sources</h2>
      <p className="text-sm">
        {health.state} · {health.pending} pending · {health.failed} retrying
      </p>
      {sources.map((source) => {
        const observed = source.nodeSnapshot ?? source.legacyDevice
        return (
          <div key={source.id} className="space-y-2 text-sm">
            <p>
              {source.deviceStack ? `Stack ${source.deviceStack.name}: ` : 'Physical asset: '}
              {source.sourceLabel}
            </p>
            <p className="text-muted-foreground">
              {!observed
                ? 'Disconnected — last accepted values retained'
                : source.nodeSnapshot?.present === false
                  ? 'Missing from latest successful scan'
                  : source.acceptedRevision < observed.inventoryRevision
                    ? 'Pending refresh'
                    : 'Linked'}{' '}
              · Last received:{' '}
              {(observed?.lastSeenAt ?? source.lastSeenAt)?.toISOString() ?? 'Unknown'}
            </p>
            {source.conflictReason && (
              <p role="alert" className="text-destructive">
                {source.conflictReason} Keep the original asset; add replacement hardware
                separately, or unlink to correct a verified entry error.
              </p>
            )}
            {source.deviceStack && (
              <p>
                Observed stack hostname: {source.deviceStack.observedHostname ?? 'Unknown'};
                version: {source.deviceStack.observedVersion ?? 'Unknown'}; management IP:{' '}
                {source.deviceStack.observedManagementIp ?? 'Unknown'}. These observations do not
                overwrite physical members.
              </p>
            )}
            {role === 'admin' && <UnlinkButton id={source.id} />}
          </div>
        )
      })}
    </section>
  )
}
