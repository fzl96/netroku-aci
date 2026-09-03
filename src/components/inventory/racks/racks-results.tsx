import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getAllDevices } from '@/lib/inventory/devices/query'
import type { RacksParams } from '@/lib/inventory/racks/params'
import { getRacksBySite } from '@/lib/inventory/racks/query'
import { getSites } from '@/lib/inventory/sites/query'
import { RacksRegionError } from './racks-region-error'
import { RacksTableClient } from './racks-table-client'

export async function RacksResults({ paramsPromise }: { paramsPromise: Promise<RacksParams> }) {
  const { siteId: siteIdParam } = await paramsPromise

  let role: 'admin' | 'member'
  let sites: Awaited<ReturnType<typeof getSites>>
  let allDevices: Awaited<ReturnType<typeof getAllDevices>>
  try {
    ;[role, sites, allDevices] = await Promise.all([
      getInventoryViewerRole(),
      getSites(),
      getAllDevices(),
    ])
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    console.error('[inventory] failed to load racks', error)
    return <RacksRegionError />
  }

  const selectedSiteId =
    siteIdParam && sites.some((site) => site.id === siteIdParam)
      ? siteIdParam
      : (sites[0]?.id ?? null)

  let racks: Awaited<ReturnType<typeof getRacksBySite>> = []
  if (selectedSiteId) {
    try {
      racks = await getRacksBySite(selectedSiteId)
    } catch (error) {
      if (!(error instanceof InventoryReadError)) throw error
      console.error('[inventory] failed to load racks for site', error)
      return <RacksRegionError />
    }
  }

  return (
    <RacksTableClient
      sites={sites}
      selectedSiteId={selectedSiteId}
      racks={racks}
      allDevices={allDevices}
      role={role}
    />
  )
}
