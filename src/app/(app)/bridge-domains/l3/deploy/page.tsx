import type { Metadata } from 'next'
import { BridgeDomainWorkflow } from '@/components/BridgeDomainWorkflow'

export const metadata: Metadata = {
  title: 'Deploy L3 Bridge Domain',
  description: 'Stage and push routed L3 bridge domain configuration to APIC.',
}

export default function Page() {
  return <BridgeDomainWorkflow variant="l3" />
}
