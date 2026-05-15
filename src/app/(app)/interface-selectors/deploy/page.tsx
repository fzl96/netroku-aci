import type { Metadata } from 'next'
import { InterfaceSelectorWorkflow } from '@/components/InterfaceSelectorWorkflow'

export const metadata: Metadata = {
  title: 'Deploy Interface Selector',
  description: 'Stage and push interface selector configuration to APIC.',
}

export default function Page() {
  return <InterfaceSelectorWorkflow mode="deploy" />
}
