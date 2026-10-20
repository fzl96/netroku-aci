'use client'

import Link from 'next/link'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { buildBdPageUrl } from '@/lib/bds/params'
import type { EpgBridgeDomainDetails } from '@/lib/epgs/query'

export function EpgBdLink({
  hostId,
  name,
  details,
}: {
  hostId: string
  name: string
  details?: EpgBridgeDomainDetails | null
}) {
  if (!name && !details) return <>—</>
  const href = buildBdPageUrl({
    hostId,
    page: 1,
    pageSize: 50,
    ...(details ? { selected: details.dn } : { query: name }),
  })
  return (
    <HoverCard openDelay={250} closeDelay={150}>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          prefetch={false}
          onClick={(event) => event.stopPropagation()}
          className="rounded-sm underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Open Bridge Domain ${details?.name ?? name}`}
        >
          {details?.name ?? name}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent
        align="start"
        sideOffset={8}
        onClick={(event) => event.stopPropagation()}
        className="w-80 max-w-[calc(100vw-2rem)] space-y-3 border border-border bg-card p-4 font-sans text-foreground shadow-lg ring-0"
      >
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
            Bridge Domain
          </p>
          <p className="mt-1 font-mono text-sm font-semibold break-all">{details?.name ?? name}</p>
          {details && <p className="mt-1 text-xs text-subtle">Tenant: {details.tenant}</p>}
        </div>
        {details ? (
          <dl className="space-y-3 text-xs">
            <div>
              <dt className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                Description
              </dt>
              <dd className="mt-1 break-words whitespace-pre-wrap">{details.description || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                VRF
              </dt>
              <dd className="mt-1 font-mono break-all">{details.vrf || '—'}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold tracking-wider text-subtle uppercase">
                Subnets
              </dt>
              <dd className="mt-1 max-h-40 overflow-y-auto">
                {details.subnets.length ? (
                  <ul className="space-y-1 font-mono">
                    {details.subnets.map((ip) => (
                      <li key={ip}>{ip}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-subtle">No subnets configured.</span>
                )}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-subtle">
            BD details have not been collected yet. Open Bridge Domains to find or resync this BD.
          </p>
        )}
        <p className="border-t border-subtle pt-2 text-[11px] text-subtle">
          Click the BD name to open Bridge Domains.
        </p>
      </HoverCardContent>
    </HoverCard>
  )
}
