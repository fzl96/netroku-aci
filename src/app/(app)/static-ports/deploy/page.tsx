import type { Metadata } from 'next'
import { StaticPortWorkflow } from '@/components/StaticPortWorkflow'

export const metadata: Metadata = {
  title: 'Deploy Static Port',
  description: 'Stage and push static port bindings to APIC.',
}

export default function Page() {
  return <StaticPortWorkflow mode="deploy" />
}
