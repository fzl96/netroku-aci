import type { Metadata } from 'next'
import { NodesShell } from '@/components/nodes/nodes-shell'
import { parseNodePageParams } from '@/lib/nodes/params'

export const metadata: Metadata = {
  title: 'Nodes',
  description: 'Cisco ACI fabric node inventory and PSU/fan hardware health resynced from APIC.',
}

export default function Page({ searchParams }: PageProps<'/nodes'>) {
  return <NodesShell paramsPromise={searchParams.then(parseNodePageParams)} />
}
