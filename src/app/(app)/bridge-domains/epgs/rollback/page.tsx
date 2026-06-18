import type { Metadata } from 'next'
import { EpgContractWorkflow } from '@/components/EpgContractWorkflow'

export const metadata: Metadata = {
  title: 'Rollback EPG Contract',
  description: 'Remove previously deployed EPG contract bindings from APIC.',
}

export default function EpgRollbackPage() {
  return <EpgContractWorkflow mode="rollback" />
}
