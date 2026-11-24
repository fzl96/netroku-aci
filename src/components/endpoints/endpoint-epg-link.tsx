import Link from 'next/link'
import type { EndpointRow } from '@/lib/endpoints/query'

export function EndpointEpgLink({ endpoint, hostId }: { endpoint: EndpointRow; hostId: string }) {
  const label = endpoint.epgDescr || endpoint.epgDn.split('/epg-').pop() || '—'
  if (!endpoint.epgId) {
    return (
      <span
        title={
          endpoint.epgDn ? `${endpoint.epgDn} — EPG details have not been collected` : undefined
        }
      >
        {label}
      </span>
    )
  }
  const search = new URLSearchParams({ apic: hostId, selected: endpoint.epgDn })
  return (
    <Link href={`/epgs?${search}`} title={endpoint.epgDn} className="text-primary hover:underline">
      {label}
    </Link>
  )
}
