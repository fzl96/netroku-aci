import 'server-only'

import { cache } from 'react'
import type { DeviceStatus, StackRole } from '@prisma/client'
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { authorizeInventoryRead, readInventoryData } from '@/lib/inventory/authorize'
import { INVENTORY_CACHE_SECONDS, INVENTORY_TAG } from '@/lib/inventory/cache'
import { buildDeviceWhere, deviceListWindow, type DeviceListParams } from './params'

export type SafeDeviceStack = {
  id: string
  name: string
  memberCount?: number
  members?: Array<{
    id: string
    name: string
    stackMember: number | null
    stackRole: StackRole | null
  }>
}

export type SafeDevice = {
  id: string
  name: string
  serialNumber: string
  assetTag: string | null
  managementIp: string | null
  status: DeviceStatus
  rackId: string | null
  rackPosition: number | null
  deviceStackId: string | null
  stackMember: number | null
  stackRole: StackRole | null
  vendor: string
  model: string
  heightU: number
  createdAt: Date
  updatedAt: Date
}

export type SafeDeviceWithRack = SafeDevice & {
  rack: { id: string; name: string; site: { id: string; name: string } } | null
  deviceStack: SafeDeviceStack | null
}

export type SafeDeviceDetail = SafeDeviceWithRack & {
  deviceStack: (SafeDeviceStack & {
    devices: Array<{
      id: string
      name: string
      serialNumber: string
      stackMember: number | null
      stackRole: StackRole | null
      rackPosition: number | null
      rack: { name: string } | null
    }>
  }) | null
}

export type DeviceCatalogEntry = {
  id: string
  name: string
  serialNumber: string
  rackId: string | null
  rackPosition: number | null
  rack?: { name: string } | null
  deviceStack?: SafeDeviceStack | null
  stackMember?: number | null
  stackRole?: StackRole | null
  vendor: string
  model: string
  heightU: number
}

export type DeviceListPage = {
  devices: SafeDeviceWithRack[]
  total: number
  page: number
  pageSize: number
}

type RawDevice = SafeDevice

export function toSafe(device: RawDevice): SafeDevice {
  return {
    id: device.id,
    name: device.name,
    serialNumber: device.serialNumber,
    assetTag: device.assetTag,
    managementIp: device.managementIp,
    status: device.status,
    rackId: device.rackId,
    rackPosition: device.rackPosition,
    deviceStackId: device.deviceStackId,
    stackMember: device.stackMember,
    stackRole: device.stackRole,
    vendor: device.vendor,
    model: device.model,
    heightU: device.heightU,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  }
}

export function toSafeWithRack(
  device: RawDevice & {
    rack: { id: string; name: string; site: { id: string; name: string } } | null
    deviceStack: {
      id: string
      name: string
      devices?: Array<{
        id: string
        name: string
        stackMember: number | null
        stackRole: StackRole | null
      }>
    } | null
  },
): SafeDeviceWithRack {
  return {
    ...toSafe(device),
    rack: device.rack,
    deviceStack: device.deviceStack
      ? {
          id: device.deviceStack.id,
          name: device.deviceStack.name,
          memberCount: device.deviceStack.devices?.length,
          members: device.deviceStack.devices,
        }
      : null,
  }
}

const cacheOptions = { tags: [INVENTORY_TAG], revalidate: INVENTORY_CACHE_SECONDS }

export async function getDevices(params: DeviceListParams): Promise<DeviceListPage> {
  await authorizeInventoryRead()
  return readInventoryData(() => unstable_cache(async () => {
    const where = buildDeviceWhere(params)
    const total = await prisma.device.count({ where })
    const window = deviceListWindow(params.page, total)
    const devices = await prisma.device.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: window.skip,
      take: window.take,
      include: {
        rack: { include: { site: true } },
        deviceStack: { select: { id: true, name: true } },
      },
    })
    return {
      devices: devices.map(toSafeWithRack),
      total,
      page: window.page,
      pageSize: window.take,
    }
  }, ['inventory', 'devices', 'list', params.query, String(params.page)], cacheOptions)())
}

/** Wrapped in React `cache()` so a detail page's `generateMetadata` and its
 *  render both resolving the same id within one request share this read. */
export const getDeviceById = cache(async (id: string): Promise<SafeDeviceDetail | null> => {
  await authorizeInventoryRead()
  return readInventoryData(() => unstable_cache(async () => {
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        rack: { include: { site: true } },
        deviceStack: {
          include: {
            devices: {
              where: { id: { not: id } },
              select: {
                id: true,
                name: true,
                serialNumber: true,
                stackMember: true,
                stackRole: true,
                rackPosition: true,
                rack: { select: { name: true } },
              },
              orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }, { name: 'asc' }],
            },
          },
        },
      },
    })
    if (!device) return null
    return {
      ...toSafe(device),
      rack: device.rack,
      deviceStack: device.deviceStack,
    }
  }, ['inventory', 'devices', 'detail', id], cacheOptions)())
})

export async function getAllDevices(): Promise<DeviceCatalogEntry[]> {
  await authorizeInventoryRead()
  return readInventoryData(() => unstable_cache(() => prisma.device.findMany({
    select: {
      id: true,
      name: true,
      serialNumber: true,
      rackId: true,
      rackPosition: true,
      rack: { select: { name: true } },
      deviceStack: { select: { id: true, name: true } },
      stackMember: true,
      stackRole: true,
      vendor: true,
      model: true,
      heightU: true,
    },
    orderBy: { name: 'asc' },
  }), ['inventory', 'devices', 'catalog'], cacheOptions)())
}

export async function getDeviceStacks(): Promise<SafeDeviceStack[]> {
  await authorizeInventoryRead()
  return readInventoryData(() => unstable_cache(async () => {
    const stacks = await prisma.deviceStack.findMany({
      select: {
        id: true,
        name: true,
        devices: {
          select: { id: true, name: true, stackMember: true, stackRole: true },
          orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    })
    return stacks.map(stack => ({
      id: stack.id,
      name: stack.name,
      memberCount: stack.devices.length,
      members: stack.devices,
    }))
  }, ['inventory', 'devices', 'stacks'], cacheOptions)())
}
