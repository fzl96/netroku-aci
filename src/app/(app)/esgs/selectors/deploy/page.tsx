import type { Metadata } from 'next'
import { EsgSelectorWorkflow } from '@/components/EsgSelectorWorkflow'

export const metadata: Metadata = {
  title: 'Add ESG Selectors',
  description: 'Add EPG and IP selectors to endpoint security groups on APIC.',
}

export default function Page() {
  return <EsgSelectorWorkflow mode="deploy" />
}
