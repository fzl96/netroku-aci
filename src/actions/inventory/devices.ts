'use server'

import { z } from 'zod'
import { DeviceStatus, StackRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { canPlaceDevice } from '@/lib/inventory/rack-placement'
import { ensureStackHasMaster } from '@/lib/inventory/stack-master'
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

function toSafe(device: RawDevice): SafeDevice {
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

function toSafeWithRack(
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
}

export async function getDeviceById(id: string): Promise<SafeDeviceDetail | null> {
  await requireSession()
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
      deviceStack: { select: { id: true, name: true } },
      stackMember: true,
      stackRole: true,
      vendor: true,
      model: true,
      heightU: true,
    },
    orderBy: { name: 'asc' },
  })
}

export async function getDeviceStacks(): Promise<SafeDeviceStack[]> {
  await requireSession()
  const stacks = await prisma.deviceStack.findMany({
    select: {
      id: true,
      name: true,
      devices: {
        select: {
          id: true,
          name: true,
          stackMember: true,
          stackRole: true,
        },
        orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  })
  return stacks.map((s) => ({
    id: s.id,
    name: s.name,
    memberCount: s.devices.length,
    members: s.devices,
  }))
}

export async function createDevice(data: DeviceFormValues): Promise<ActionResult<SafeDeviceWithRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }

    const stackName = parsed.data.deviceStackName?.trim() || null
    const stackRole = stackName ? parsed.data.stackRole ?? null : null
    const stackMember = stackName ? parsed.data.stackMember ?? null : null

    const device = await prisma.$transaction(async (tx) => {
      let deviceStackId: string | null = null
      if (stackName) {
        let stack = await tx.deviceStack.findFirst({ where: { name: stackName } })
        if (!stack) {
          stack = await tx.deviceStack.create({ data: { name: stackName } })
        }
        deviceStackId = stack.id

        if (stackMember !== null) {
          const conflict = await tx.device.findFirst({
            where: { deviceStackId, stackMember },
            select: { name: true },
          })
          if (conflict) {
            throw new Error(`Switch #${stackMember} is already used by "${conflict.name}" in stack "${stackName}".`)
          }
        }

        if (stackRole === 'MASTER') {
          await tx.device.updateMany({
            where: { deviceStackId, stackRole: 'MASTER' },
            data: { stackRole: 'MEMBER' },
          })
        }
      }

      if (parsed.data.managementIp) {
        const ipConflict = await tx.device.findFirst({
          where: {
            managementIp: parsed.data.managementIp,
            ...(deviceStackId ? { deviceStackId: { not: deviceStackId } } : {}),
          },
          select: { name: true, serialNumber: true },
        })
        if (ipConflict) {
          throw new Error(
            `Management IP "${parsed.data.managementIp}" is already used by "${ipConflict.name}" (${ipConflict.serialNumber}).`,
          )
        }
      }

      const created = await tx.device.create({
        data: {
          name: parsed.data.name,
          serialNumber: parsed.data.serialNumber,
          assetTag: parsed.data.assetTag ?? null,
          managementIp: parsed.data.managementIp ?? null,
          status: parsed.data.status,
          vendor: parsed.data.vendor,
          model: parsed.data.model,
          heightU: parsed.data.heightU,
          deviceStackId,
          stackRole,
          stackMember,
        },
      })

      if (deviceStackId) {
        await ensureStackHasMaster(tx, deviceStackId)
      }

      return tx.device.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          rack: { include: { site: true } },
          deviceStack: {
            select: {
              id: true,
              name: true,
              devices: {
                select: {
                  id: true,
                  name: true,
                  stackMember: true,
                  stackRole: true,
                },
                orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
              },
            },
          },
        },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.create',
      target: `${device.name} (${device.serialNumber})`,
    })

    return { success: true, data: toSafeWithRack(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevice(
  id: string,
  data: DeviceUpdateFormValues,
): Promise<ActionResult<SafeDeviceWithRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }

    const stackName = parsed.data.deviceStackName?.trim() || null
    const stackRole = stackName ? parsed.data.stackRole ?? null : null
    const stackMember = stackName ? parsed.data.stackMember ?? null : null

    const device = await prisma.$transaction(async (tx) => {
      const existing = await tx.device.findUnique({
        where: { id },
        select: { deviceStackId: true, stackRole: true },
      })
      if (!existing) throw new Error('Device not found')

      const prevStackId = existing.deviceStackId
      let nextStackId: string | null = null

      if (stackName) {
        let stack = await tx.deviceStack.findFirst({ where: { name: stackName } })
        if (!stack) {
          stack = await tx.deviceStack.create({ data: { name: stackName } })
        }
        nextStackId = stack.id

        if (stackMember !== null) {
          const conflict = await tx.device.findFirst({
            where: {
              deviceStackId: nextStackId,
              stackMember,
              id: { not: id },
            },
            select: { name: true },
          })
          if (conflict) {
            throw new Error(`Switch #${stackMember} is already used by "${conflict.name}" in stack "${stackName}".`)
          }
        }

        if (stackRole === 'MASTER') {
          await tx.device.updateMany({
            where: {
              deviceStackId: nextStackId,
              stackRole: 'MASTER',
              id: { not: id },
            },
            data: { stackRole: 'MEMBER' },
          })
        }
      }

      if (parsed.data.managementIp) {
        const ipConflict = await tx.device.findFirst({
          where: {
            managementIp: parsed.data.managementIp,
            id: { not: id },
            ...(nextStackId ? { deviceStackId: { not: nextStackId } } : {}),
          },
          select: { name: true, serialNumber: true },
        })
        if (ipConflict) {
          throw new Error(
            `Management IP "${parsed.data.managementIp}" is already used by "${ipConflict.name}" (${ipConflict.serialNumber}).`,
          )
        }
      }

      await tx.device.update({
        where: { id },
        data: {
          name: parsed.data.name,
          serialNumber: parsed.data.serialNumber,
          assetTag: parsed.data.assetTag ?? null,
          managementIp: parsed.data.managementIp ?? null,
          status: parsed.data.status,
          vendor: parsed.data.vendor,
          model: parsed.data.model,
          heightU: parsed.data.heightU,
          deviceStackId: nextStackId,
          stackRole,
          stackMember,
        },
      })

      if (nextStackId) {
        const explicitlyDemotedId =
          prevStackId === nextStackId &&
          existing.stackRole === StackRole.MASTER &&
          stackRole !== StackRole.MASTER
            ? id
            : undefined
        await ensureStackHasMaster(tx, nextStackId, explicitlyDemotedId)
      }

      if (prevStackId && prevStackId !== nextStackId) {
        const count = await tx.device.count({ where: { deviceStackId: prevStackId } })
        if (count === 0) {
          await tx.deviceStack.delete({ where: { id: prevStackId } })
        } else {
          await ensureStackHasMaster(tx, prevStackId)
        }
      }

      return tx.device.findUniqueOrThrow({
        where: { id },
        include: {
          rack: { include: { site: true } },
          deviceStack: {
            select: {
              id: true,
              name: true,
              devices: {
                select: {
                  id: true,
                  name: true,
                  stackMember: true,
                  stackRole: true,
                },
                orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
              },
            },
          },
        },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.update',
      target: `${device.name} (${device.serialNumber})`,
    })

    return { success: true, data: toSafeWithRack(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteDevice(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.device.findUnique({
      where: { id },
      select: { name: true, serialNumber: true, deviceStackId: true },
    })
    if (!existing) return { success: false, error: 'Device not found' }

    await prisma.$transaction(async (tx) => {
      await tx.device.delete({ where: { id } })
      if (existing.deviceStackId) {
        const count = await tx.device.count({ where: { deviceStackId: existing.deviceStackId } })
        if (count === 0) {
          await tx.deviceStack.delete({ where: { id: existing.deviceStackId } })
        } else {
          await ensureStackHasMaster(tx, existing.deviceStackId)
        }
      }
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.delete',
      target: `${existing.name} (${existing.serialNumber})`,
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
