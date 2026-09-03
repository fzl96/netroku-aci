import { notFound, redirect } from 'next/navigation'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { ApicHostReadError, getApicHosts } from '@/lib/apic-hosts/query'
import { ApicHostsClient } from './apic-hosts-client'
import { ApicHostsRegionError } from './apic-hosts-region-error'

export async function ApicHostsResults() {
  let role: string
  try {
    role = (await requireSession()).role
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    redirect('/signin')
  }
  if (role !== 'admin') notFound()

  let hosts: Awaited<ReturnType<typeof getApicHosts>>
  try {
    hosts = await getApicHosts()
  } catch (error) {
    if (!(error instanceof ApicHostReadError)) throw error
    console.error('[apic-hosts] failed to load hosts', error)
    return <ApicHostsRegionError />
  }

  return <ApicHostsClient initialHosts={hosts} />
}
