import type { Metadata } from 'next'
import { EndpointsShell } from '@/components/endpoints/endpoints-shell'
import { parseEndpointPageParams, type RawEndpointPageParams } from '@/lib/endpoints/params'

export const metadata: Metadata = {
  title: 'Endpoints',
  description: 'Browse active and historical endpoints learned by the APIC fabric.',
}

export default function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<RawEndpointPageParams>
}) {
  return <EndpointsShell paramsPromise={searchParams.then(parseEndpointPageParams)} />
}
