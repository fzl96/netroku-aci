import type { Metadata } from 'next'
import { InterfaceSelectorWorkflow } from '@/components/InterfaceSelectorWorkflow'

export const metadata: Metadata = {
  title: 'Rollback Interface Selector',
  description: 'Remove previously deployed interface selectors from APIC.',
}

export default function Page() {
  return <InterfaceSelectorWorkflow mode="rollback" />
}
