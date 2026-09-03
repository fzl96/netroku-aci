import 'server-only'

import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { authorizeInventoryRead, readInventoryData } from '@/lib/inventory/authorize'
import { INVENTORY_CACHE_SECONDS, INVENTORY_TAG } from '@/lib/inventory/cache'

export type SafeSite = {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
}

export function toSafeSite(site: SafeSite): SafeSite {
  return {
    id: site.id,
    name: site.name,
    address: site.address,
    latitude: site.latitude,
    longitude: site.longitude,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }
}

export async function getSites(): Promise<SafeSite[]> {
  await authorizeInventoryRead()
  return readInventoryData(() =>
    unstable_cache(
      async () => {
        const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } })
        return sites.map(toSafeSite)
      },
      ['inventory', 'sites'],
      { tags: [INVENTORY_TAG], revalidate: INVENTORY_CACHE_SECONDS },
    )(),
  )
}
