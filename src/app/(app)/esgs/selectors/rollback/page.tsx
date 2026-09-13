import type { Metadata } from 'next'
import { EsgSelectorWorkflow } from '@/components/EsgSelectorWorkflow'

export const metadata: Metadata = {
  title: 'Rollback ESG Selectors',
  description: 'Remove EPG and IP selectors from endpoint security groups on APIC.',
}

export default function Page() {
  return <EsgSelectorWorkflow mode="rollback" />
}
