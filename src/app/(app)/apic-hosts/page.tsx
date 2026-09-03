import type { Metadata } from 'next'
import { ApicHostsView } from '@/components/apic-hosts/apic-hosts-view'

export const metadata: Metadata = {
  title: 'APIC Hosts',
  description: 'Manage registered Cisco APIC controllers and their credentials.',
}

export default function Page() {
  return <ApicHostsView />
}
