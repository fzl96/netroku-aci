import type { Metadata } from 'next'
import { LegacyEndpointsView } from '@/components/legacy/endpoints/endpoints-view'
import { parseLegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'

export const metadata: Metadata = {
  title: 'Legacy Endpoints',
  description: 'Current and historical legacy endpoint placement.',
}

export default function Page({ searchParams }: PageProps<'/legacy/endpoints'>) {
  return <LegacyEndpointsView paramsPromise={searchParams.then(parseLegacyEndpointPageParams)} />
}
