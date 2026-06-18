import type { Metadata } from 'next'
import { StaticPortWorkflow } from '@/components/StaticPortWorkflow'

export const metadata: Metadata = {
  title: 'Rollback Static Port',
  description: 'Remove previously deployed static port bindings from APIC.',
}

export default function Page() {
  return <StaticPortWorkflow mode="rollback" />
}
