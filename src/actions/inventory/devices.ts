'use server'

import { z } from 'zod'
import type { DeviceStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { canPlaceDevice } from '@/lib/inventory/rack-placement'
import {
  buildDeviceWhere,
  deviceListWindow,
  type DeviceListParams,
} from '@/lib/inventory/device-query'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeDevice = {
  id: string
  name: string
  serialNumber: string
  assetTag: string | null
  status: DeviceStatus
  rackId: string | null
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
  createdAt: Date
  updatedAt: Date
}

export type SafeDeviceWithRack = SafeDevice & {
  rack: { id: string; name: string; site: { id: string; name: string } } | null
}

export type DeviceCatalogEntry = {
  id: string
  name: string
  serialNumber: string
  rackId: string | null
  rackPosition: number | null
  rack?: { name: string } | null
  vendor: string
  model: string
  heightU: number
}

export type DeviceListPage = {
  devices: SafeDeviceWithRack[]
  total: number
  page: number
}

async function requireSession(): Promise<{ id: string; role: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return {
    id: session.user.id,
    role: session.user.role ?? 'member',
    userName: session.user.username ?? session.user.name,
  }
}

async function requireAdmin(): Promise<{ id: string; role: string; userName: string }> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

type RawDevice = {
  id: string
  name: string
  serialNumber: string
  assetTag: string | null
  status: DeviceStatus
  rackId: string | null
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
  createdAt: Date
  updatedAt: Date
}

function toSafe(device: RawDevice): SafeDevice {
  return {
    id: device.id,
    name: device.name,
    serialNumber: device.serialNumber,
    assetTag: device.assetTag,
    status: device.status,
    rackId: device.rackId,
    rackPosition: device.rackPosition,
    vendor: device.vendor,
    model: device.model,
    heightU: device.heightU,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  }
}

function toSafeWithRack(
  device: RawDevice & { rack: { id: string; name: string; site: { id: string; name: string } } | null },
): SafeDeviceWithRack {
  return { ...toSafe(device), rack: device.rack }
}

export async function getDevices(params: DeviceListParams): Promise<DeviceListPage> {
  await requireSession()
  const where = buildDeviceWhere(params)
  const total = await prisma.device.count({ where })
  const window = deviceListWindow(params.page, total)
  const devices = await prisma.device.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: window.skip,
    take: window.take,
    include: { rack: { include: { site: true } } },
  })
  return { devices: devices.map(toSafeWithRack), total, page: window.page }
}

export async function getDeviceById(id: string): Promise<SafeDeviceWithRack | null> {
  await requireSession()
  const device = await prisma.device.findUnique({
    where: { id },
    include: { rack: { include: { site: true } } },
  })
  return device ? toSafeWithRack(device) : null
}

export async function getAllDevices(): Promise<DeviceCatalogEntry[]> {
  await requireSession()
  return prisma.device.findMany({
    select: {
      id: true,
      name: true,
      serialNumber: true,
      rackId: true,
      rackPosition: true,
      rack: { select: { name: true } },
      vendor: true,
      model: true,
      heightU: true,
    },
    orderBy: { name: 'asc' },
  })
}

export async function createDevice(data: DeviceFormValues): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const device = await prisma.device.create({
      data: {
        name: parsed.data.name,
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        status: parsed.data.status,
        vendor: parsed.data.vendor,
        model: parsed.data.model,
        heightU: parsed.data.heightU,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.create',
      target: `${device.name} (${device.serialNumber})`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevice(
  id: string,
  data: DeviceUpdateFormValues,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.device.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        status: parsed.data.status,
        vendor: parsed.data.vendor,
        model: parsed.data.model,
        heightU: parsed.data.heightU,
      },
    })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    const device = await prisma.device.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.update',
      target: `${device.name} (${device.serialNumber})`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteDevice(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.device.findUnique({ where: { id } })
    const result = await prisma.device.deleteMany({ where: { id } })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.delete',
      target: existing ? `${existing.name} (${existing.serialNumber})` : id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevicePlacement(
  deviceId: string,
  rackId: string,
  rackPosition: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()

    const device = await prisma.$transaction(async (tx) => {
      const [rack, movingDevice, siblings] = await Promise.all([
        tx.rack.findUnique({ where: { id: rackId }, select: { heightU: true } }),
        tx.device.findUnique({ where: { id: deviceId }, select: { heightU: true } }),
        tx.device.findMany({
          where: { rackId },
          select: { id: true, rackPosition: true, heightU: true },
        }),
      ])
      if (!rack) throw new Error('Rack not found')
      if (!movingDevice) throw new Error('Device not found')

      if (!canPlaceDevice(siblings, deviceId, rackPosition, movingDevice.heightU, rack.heightU)) {
        throw new Error('Cannot place device here due to rack collision')
      }

      return tx.device.update({
        where: { id: deviceId },
        data: { rackId, rackPosition },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.place',
      target: `${device.name} → rack ${rackId} U${rackPosition}`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function clearDevicePlacement(deviceId: string): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const result = await prisma.device.updateMany({
      where: { id: deviceId },
      data: { rackId: null, rackPosition: null },
    })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.unassign',
      target: device.name,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDeviceHeight(
  deviceId: string,
  heightU: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsedHeight = z.number().int().positive().safeParse(heightU)
    if (!parsedHeight.success) return { success: false, error: 'Invalid height' }

    const device = await prisma.$transaction(async (tx) => {
      const movingDevice = await tx.device.findUnique({
        where: { id: deviceId },
        select: { rackId: true, rackPosition: true },
      })
      if (!movingDevice) throw new Error('Device not found')

      if (movingDevice.rackId && movingDevice.rackPosition !== null) {
        const [rack, siblings] = await Promise.all([
          tx.rack.findUnique({ where: { id: movingDevice.rackId }, select: { heightU: true } }),
          tx.device.findMany({
            where: { rackId: movingDevice.rackId },
            select: { id: true, rackPosition: true, heightU: true },
          }),
        ])
        if (!rack) throw new Error('Rack not found')
        if (
          !canPlaceDevice(
            siblings,
            deviceId,
            movingDevice.rackPosition,
            parsedHeight.data,
            rack.heightU,
          )
        ) {
          throw new Error('Cannot resize: not enough free U space')
        }
      }

      return tx.device.update({
        where: { id: deviceId },
        data: { heightU: parsedHeight.data },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.resize',
      target: `${device.name} → ${device.heightU}U`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
