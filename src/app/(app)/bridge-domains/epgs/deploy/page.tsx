import type { Metadata } from 'next'
import { EpgContractWorkflow } from '@/components/EpgContractWorkflow'

export const metadata: Metadata = {
  title: 'Deploy EPG Contract',
  description: 'Stage and push EPG contract bindings to APIC.',
}

export default function EpgDeployPage() {
  return <EpgContractWorkflow mode="deploy" />
}
