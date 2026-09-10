import { Suspense } from 'react'
import { getDiscoveredDevices } from '@/lib/inventory/sources/query'
import { DiscoveryClient } from '@/components/inventory/discovered/discovery-client'
import { DiscoveryHeader } from '@/components/inventory/discovered/discovery-header'
export const metadata = { title: 'Discovered devices' }
async function Results({
  params,
}: {
  params: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await params
  const input = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  )
  const data = await getDiscoveredDevices(input)
  return <DiscoveryClient data={data} />
}
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <div className="min-h-full bg-background">
      <Suspense
        fallback={
          <>
            <DiscoveryHeader />
            <p className="px-4 py-6 text-sm text-muted-foreground md:px-8">Loading discoveries…</p>
          </>
        }
      >
        <Results params={searchParams} />
      </Suspense>
    </div>
  )
}
