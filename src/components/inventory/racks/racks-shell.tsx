import { Suspense } from 'react'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getAllDevices, type DeviceCatalogEntry } from '@/lib/inventory/devices/query'
import type { RacksParams } from '@/lib/inventory/racks/params'
import {
  getRacksBySite,
  type RacksLoadState,
  type RacksResultsPayload,
  type SafeRackWithDevices,
} from '@/lib/inventory/racks/query'
import { getSites, type SafeSite } from '@/lib/inventory/sites/query'
import { RacksResults } from './racks-results'
import { RacksResultsSkeleton } from './racks-skeleton'

type RacksBaseData = {
  role: 'admin' | 'member'
  sites: SafeSite[]
  allDevices: DeviceCatalogEntry[]
}

async function loadBase(): Promise<RacksLoadState<RacksBaseData>> {
  try {
    const [role, sites, allDevices] = await Promise.all([
      getInventoryViewerRole(),
      getSites(),
      getAllDevices(),
    ])
    return { kind: 'ready', data: { role, sites, allDevices } }
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    console.error('[inventory] failed to load racks', error)
    return { kind: 'unauthorized' }
  }
}

async function loadResults(
  paramsPromise: Promise<RacksParams>,
  basePromise: Promise<RacksLoadState<RacksBaseData>>,
): Promise<RacksLoadState<RacksResultsPayload>> {
  const [{ siteId: siteIdParam }, base] = await Promise.all([paramsPromise, basePromise])
  if (base.kind === 'unauthorized') return base

  const { role, sites, allDevices } = base.data
  const selectedSiteId =
    siteIdParam && sites.some((site) => site.id === siteIdParam)
      ? siteIdParam
      : (sites[0]?.id ?? null)

  let racks: SafeRackWithDevices[] = []
  if (selectedSiteId) {
    try {
      racks = await getRacksBySite(selectedSiteId)
    } catch (error) {
      if (!(error instanceof InventoryReadError)) throw error
      console.error('[inventory] failed to load racks for site', error)
      return { kind: 'unauthorized' }
    }
  }

  return { kind: 'ready', data: { role, sites, selectedSiteId, racks, allDevices } }
}

export function RacksShell({ paramsPromise }: { paramsPromise: Promise<RacksParams> }) {
  const basePromise = loadBase()
  const resultsPromise = loadResults(paramsPromise, basePromise)

  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex h-16 items-center px-4 md:px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Racks</h1>
            <p className="mt-0.5 text-xs text-subtle">
              Rack elevations and device placement by site
            </p>
          </div>
        </div>
      </div>
      <Suspense fallback={<RacksResultsSkeleton />}>
        <RacksResults dataPromise={resultsPromise} />
      </Suspense>
    </div>
  )
}
