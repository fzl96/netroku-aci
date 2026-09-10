import { Suspense } from 'react'
import { getDiscoveredDevices } from '@/lib/inventory/sources/query'
import { DiscoveryClient } from '@/components/inventory/discovered/discovery-client'
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
  return (
    <DiscoveryClient
      key={`${data.kind}:${data.page}:${data.q}:${data.linked}:${data.assetq}`}
      data={data}
    />
  )
}
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border px-4 py-4 md:px-8">
        <h1 className="font-serif text-lg font-semibold">Discovered devices</h1>
        <p className="text-xs text-muted-foreground">
          Connect collected data to physical inventory
        </p>
      </header>
      <Suspense fallback={<p className="p-8">Loading discoveries…</p>}>
        <Results params={searchParams} />
      </Suspense>
    </div>
  )
}
