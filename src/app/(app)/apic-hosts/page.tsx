import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { getApicHosts } from '@/actions/apic-hosts'
import { ApicHostsClient } from './ApicHostsClient'

export default async function ApicHostsPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const hosts = await getApicHosts()

  return <ApicHostsClient initialHosts={hosts} />
}
