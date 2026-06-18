import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { ApicHostsClient } from './ApicHostsClient'

export const metadata: Metadata = {
  title: 'APIC Hosts',
  description: 'Manage registered Cisco APIC controllers and their credentials.',
}

export default async function ApicHostsPage() {
  const session = await getSession()
  if (!session) redirect('/signin')
  if (session.user.role !== 'admin') notFound()

  const hosts = await getApicHosts()

  return <ApicHostsClient initialHosts={hosts} />
}
