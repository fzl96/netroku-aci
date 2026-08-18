'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  rackSchema,
  rackUpdateSchema,
  type RackFormValues,
  type RackUpdateFormValues,
} from '@/lib/schemas/rack'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

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
  vendor: string
  model: string
  heightU: number
}

export type SafeRackWithDevices = SafeRack & { devices: SafeRackDevice[] }

export type RackDropdownOption = { id: string; name: string; site: { name: string } }

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

function toSafe(rack: {
  id: string
  name: string
  heightU: number
  siteId: string
  createdAt: Date
  updatedAt: Date
}): SafeRack {
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
  await requireSession()
  const racks = await prisma.rack.findMany({
    where: { siteId },
    orderBy: { name: 'asc' },
    include: { devices: { orderBy: { name: 'asc' } } },
  })
  return racks.map((rack) => ({
    ...toSafe(rack),
    devices: rack.devices.map((device) => ({
      id: device.id,
      name: device.name,
      serialNumber: device.serialNumber,
      rackPosition: device.rackPosition,
      vendor: device.vendor,
      model: device.model,
      heightU: device.heightU,
    })),
  }))
}

export async function getAllRacksForDropdown(): Promise<RackDropdownOption[]> {
  await requireSession()
  return prisma.rack.findMany({
    select: { id: true, name: true, site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createRack(data: RackFormValues): Promise<ActionResult<SafeRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = rackSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const rack = await prisma.rack.create({
      data: {
        name: parsed.data.name,
        heightU: parsed.data.heightU,
        siteId: parsed.data.siteId,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.create',
      target: rack.name,
    })
    return { success: true, data: toSafe(rack) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateRack(
  id: string,
  data: RackUpdateFormValues,
): Promise<ActionResult<SafeRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = rackUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.rack.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        heightU: parsed.data.heightU,
        siteId: parsed.data.siteId,
      },
    })
    if (result.count === 0) return { success: false, error: 'Rack not found' }
    const rack = await prisma.rack.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.update',
      target: rack.name,
    })
    return { success: true, data: toSafe(rack) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteRack(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.rack.findUnique({ where: { id } })
    const result = await prisma.rack.deleteMany({ where: { id } })
    if (result.count === 0) return { success: false, error: 'Rack not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.delete',
      target: existing?.name ?? id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
