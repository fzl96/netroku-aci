import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { ApicHostsClient } from './ApicHostsClient'

export const metadata: Metadata = {
  title: 'APIC Hosts',
  description: 'Manage registered Cisco APIC controllers and their credentials.',
}

export default async function ApicHostsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const hosts = await getApicHosts()

  return <ApicHostsClient initialHosts={hosts} />
}
