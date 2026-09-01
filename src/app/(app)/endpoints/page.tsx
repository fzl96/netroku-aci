import type { Metadata } from 'next'
import { EndpointsView } from '@/components/endpoints/endpoints-view'
import {
  parseEndpointPageParams,
  type RawEndpointPageParams,
} from '@/lib/endpoints/params'

export const metadata: Metadata = {
  title: 'Endpoints',
  description: 'Browse active and historical endpoints learned by the APIC fabric.',
}

export default function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<RawEndpointPageParams>
}) {
  return (
    <EndpointsView paramsPromise={searchParams.then(parseEndpointPageParams)} />
  )
}
