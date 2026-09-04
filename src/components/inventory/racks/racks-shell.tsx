import { Suspense } from 'react'
import { getInventoryViewerRole } from '@/lib/inventory/authorize'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getAllDevices, type DeviceCatalogEntry } from '@/lib/inventory/devices/query'
import type { RacksParams } from '@/lib/inventory/racks/params'
import { getRacksBySite, type SafeRackWithDevices } from '@/lib/inventory/racks/query'
import { getSites, type SafeSite } from '@/lib/inventory/sites/query'
import { RacksResults } from './racks-results'
import { RacksResultsSkeleton } from './racks-skeleton'

export type RacksLoadState<T> = { kind: 'ready'; data: T } | { kind: 'unauthorized' }

type RacksBaseData = {
  role: 'admin' | 'member'
  sites: SafeSite[]
  allDevices: DeviceCatalogEntry[]
}

export type RacksResultsPayload = {
  role: 'admin' | 'member'
  sites: SafeSite[]
  selectedSiteId: string | null
  racks: SafeRackWithDevices[]
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
    <>
      <div className="px-8 pt-6">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
      </div>
      <Suspense fallback={<RacksResultsSkeleton />}>
        <RacksResults dataPromise={resultsPromise} />
      </Suspense>
    </>
  )
}
