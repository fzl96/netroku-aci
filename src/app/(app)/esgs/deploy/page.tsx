import type { Metadata } from 'next'
import { EsgWorkflow } from '@/components/EsgWorkflow'

export const metadata: Metadata = {
  title: 'Deploy ESG',
  description: 'Stage and push endpoint security groups and their contracts to APIC.',
}

export default function Page() {
  return <EsgWorkflow mode="deploy" />
}
