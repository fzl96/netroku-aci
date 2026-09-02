import type { Metadata } from 'next'
import { NodesView } from '@/components/nodes/nodes-view'
import { parseNodePageParams } from '@/lib/nodes/params'

export const metadata: Metadata = {
  title: 'Nodes',
  description: 'Cisco ACI fabric node inventory and PSU/fan hardware health resynced from APIC.',
}

export default function Page({ searchParams }: PageProps<'/nodes'>) {
  return <NodesView paramsPromise={searchParams.then(parseNodePageParams)} />
}
