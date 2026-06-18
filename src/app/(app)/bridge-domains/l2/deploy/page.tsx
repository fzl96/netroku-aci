import type { Metadata } from 'next'
import { BridgeDomainWorkflow } from '@/components/BridgeDomainWorkflow'

export const metadata: Metadata = {
  title: 'Deploy L2 Bridge Domain',
  description: 'Stage and push L2-only bridge domain configuration to APIC.',
}

export default function Page() {
  return <BridgeDomainWorkflow variant="l2" />
}
