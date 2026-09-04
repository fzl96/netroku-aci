import type { Metadata } from 'next'
import { ApicHostsShell } from '@/components/apic-hosts/apic-hosts-shell'

export const metadata: Metadata = {
  title: 'APIC Hosts',
  description: 'Manage registered Cisco APIC controllers and their credentials.',
}

export default function Page() {
  return <ApicHostsShell />
}
