import type { Metadata } from 'next'
import { BridgeDomainWorkflow } from '@/components/BridgeDomainWorkflow'

export const metadata: Metadata = {
  title: 'Rollback L2 Bridge Domain',
  description: 'Remove previously deployed L2-only bridge domains from APIC.',
}

export default function Page() {
  return <BridgeDomainWorkflow variant="l2" mode="rollback" />
}
