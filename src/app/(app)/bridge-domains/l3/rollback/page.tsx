import type { Metadata } from 'next'
import { BridgeDomainWorkflow } from '@/components/BridgeDomainWorkflow'

export const metadata: Metadata = {
  title: 'Rollback L3 Bridge Domain',
  description: 'Remove previously deployed L3 bridge domains from APIC.',
}

export default function Page() {
  return <BridgeDomainWorkflow variant="l3" mode="rollback" />
}
