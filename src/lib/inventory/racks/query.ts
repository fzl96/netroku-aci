import 'server-only'

import type { StackRole } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { authorizeInventoryRead, readInventoryData } from '@/lib/inventory/authorize'
import { INVENTORY_CACHE_SECONDS, INVENTORY_TAG } from '@/lib/inventory/cache'
import type { DeviceCatalogEntry } from '@/lib/inventory/devices/query'
import type { SafeSite } from '@/lib/inventory/sites/query'

export type SafeRack = {
  id: string
  name: string
  heightU: number
  siteId: string
  createdAt: Date
  updatedAt: Date
}

export type SafeRackDevice = {
  id: string
  name: string
  serialNumber: string
  rackPosition: number | null
  deviceStack?: { id: string; name: string } | null
  stackMember?: number | null
  stackRole?: StackRole | null
  vendor: string
  model: string
  heightU: number
}

export type SafeRackWithDevices = SafeRack & { devices: SafeRackDevice[] }

export type RackDropdownOption = { id: string; name: string; site: { name: string } }

export type RacksLoadState<T> = { kind: 'ready'; data: T } | { kind: 'unauthorized' }

export type RacksResultsPayload = {
  role: 'admin' | 'member'
  sites: SafeSite[]
  selectedSiteId: string | null
  racks: SafeRackWithDevices[]
  allDevices: DeviceCatalogEntry[]
}

export function toSafeRack(rack: SafeRack): SafeRack {
  return {
    id: rack.id,
    name: rack.name,
    heightU: rack.heightU,
    siteId: rack.siteId,
    createdAt: rack.createdAt,
    updatedAt: rack.updatedAt,
  }
}

export async function getRacksBySite(siteId: string): Promise<SafeRackWithDevices[]> {
  await authorizeInventoryRead()
  return readInventoryData(() =>
    unstable_cache(
      async () => {
        const racks = await prisma.rack.findMany({
          where: { siteId },
          orderBy: { name: 'asc' },
          include: {
            devices: {
              orderBy: { name: 'asc' },
              include: { deviceStack: { select: { id: true, name: true } } },
            },
          },
        })
        return racks.map((rack) => ({
          ...toSafeRack(rack),
          devices: rack.devices.map((device) => ({
            id: device.id,
            name: device.name,
            serialNumber: device.serialNumber,
            rackPosition: device.rackPosition,
            deviceStack: device.deviceStack,
            stackMember: device.stackMember,
            stackRole: device.stackRole,
            vendor: device.vendor,
            model: device.model,
            heightU: device.heightU,
          })),
        }))
      },
      ['inventory', 'racks', 'by-site', siteId],
      { tags: [INVENTORY_TAG], revalidate: INVENTORY_CACHE_SECONDS },
    )(),
  )
}

export async function getAllRacksForDropdown(): Promise<RackDropdownOption[]> {
  await authorizeInventoryRead()
  return readInventoryData(() =>
    unstable_cache(
      () =>
        prisma.rack.findMany({
          select: { id: true, name: true, site: { select: { name: true } } },
          orderBy: { name: 'asc' },
        }),
      ['inventory', 'racks', 'dropdown'],
      { tags: [INVENTORY_TAG], revalidate: INVENTORY_CACHE_SECONDS },
    )(),
  )
}
