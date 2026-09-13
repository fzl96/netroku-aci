import type { Metadata } from 'next'
import { EsgWorkflow } from '@/components/EsgWorkflow'

export const metadata: Metadata = {
  title: 'Rollback ESG',
  description: 'Remove previously deployed endpoint security groups from APIC.',
}

export default function Page() {
  return <EsgWorkflow mode="rollback" />
}
