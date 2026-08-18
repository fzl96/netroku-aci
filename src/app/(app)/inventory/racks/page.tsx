import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getSites } from '@/actions/inventory/sites'
import { getRacksBySite } from '@/actions/inventory/racks'
import { getAllDevices } from '@/actions/inventory/devices'
import { RacksClient } from './RacksClient'

export const metadata: Metadata = {
  title: 'Racks',
  description: 'Site-by-site rack elevation and device placement.',
}

export default async function RacksPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { siteId: siteIdParam } = await searchParams
  const [sites, allDevices] = await Promise.all([getSites(), getAllDevices()])

  const selectedSiteId =
    siteIdParam && sites.some((site) => site.id === siteIdParam)
      ? siteIdParam
      : (sites[0]?.id ?? null)

  const racks = selectedSiteId ? await getRacksBySite(selectedSiteId) : []
  const role = session.user.role === 'admin' ? 'admin' : 'member'

  return (
    <RacksClient
      sites={sites}
      selectedSiteId={selectedSiteId}
      racks={racks}
      allDevices={allDevices}
      role={role}
    />
  )
}
