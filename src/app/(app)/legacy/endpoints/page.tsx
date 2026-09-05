import type { Metadata } from 'next'
import { LegacyEndpointsShell } from '@/components/legacy/endpoints/endpoints-shell'
import { parseLegacyEndpointPageParams } from '@/lib/legacy/endpoints/params'

export const metadata: Metadata = {
  title: 'Legacy Endpoints',
  description: 'Current and historical legacy endpoint placement.',
}

export default function Page({ searchParams }: PageProps<'/legacy/endpoints'>) {
  return <LegacyEndpointsShell paramsPromise={searchParams.then(parseLegacyEndpointPageParams)} />
}
