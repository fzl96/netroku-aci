import 'server-only'

import { z } from 'zod'
import { StackRole } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { canPlaceDevice } from '@/lib/inventory/rack-placement'
import { ensureStackHasMaster } from '@/lib/inventory/stack-master'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'
import { toSafe, toSafeWithRack, type SafeDevice, type SafeDeviceWithRack } from './query'

export async function createDeviceRecord(data: DeviceFormValues): Promise<SafeDeviceWithRack> {
  const actor = await requireAdmin()
  const parsed = deviceSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const stackName = parsed.data.deviceStackName?.trim() || null
  const stackRole = stackName ? (parsed.data.stackRole ?? null) : null
  const stackMember = stackName ? (parsed.data.stackMember ?? null) : null

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
          throw new Error(
            `Switch #${stackMember} is already used by "${conflict.name}" in stack "${stackName}".`,
          )
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
              select: { id: true, name: true, stackMember: true, stackRole: true },
              orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
            },
          },
        },
      },
    })
  })

  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.create',
    target: `${device.name} (${device.serialNumber})`,
  })

  return toSafeWithRack(device)
}

export async function updateDeviceRecord(
  id: string,
  data: DeviceUpdateFormValues,
): Promise<SafeDeviceWithRack> {
  const actor = await requireAdmin()
  const parsed = deviceUpdateSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const stackName = parsed.data.deviceStackName?.trim() || null
  const stackRole = stackName ? (parsed.data.stackRole ?? null) : null
  const stackMember = stackName ? (parsed.data.stackMember ?? null) : null

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
          where: { deviceStackId: nextStackId, stackMember, id: { not: id } },
          select: { name: true },
        })
        if (conflict) {
          throw new Error(
            `Switch #${stackMember} is already used by "${conflict.name}" in stack "${stackName}".`,
          )
        }
      }

      if (stackRole === 'MASTER') {
        await tx.device.updateMany({
          where: { deviceStackId: nextStackId, stackRole: 'MASTER', id: { not: id } },
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
              select: { id: true, name: true, stackMember: true, stackRole: true },
              orderBy: [{ stackRole: 'asc' }, { stackMember: 'asc' }],
            },
          },
        },
      },
    })
  })

  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.update',
    target: `${device.name} (${device.serialNumber})`,
  })

  return toSafeWithRack(device)
}

export async function deleteDeviceRecord(id: string): Promise<void> {
  const actor = await requireAdmin()
  const existing = await prisma.device.findUnique({
    where: { id },
    select: { name: true, serialNumber: true, deviceStackId: true },
  })
  if (!existing) throw new Error('Device not found')

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

  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.delete',
    target: `${existing.name} (${existing.serialNumber})`,
  })
}

export async function updateDevicePlacementRecord(
  deviceId: string,
  rackId: string,
  rackPosition: number,
): Promise<SafeDevice> {
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

    return tx.device.update({ where: { id: deviceId }, data: { rackId, rackPosition } })
  })

  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.place',
    target: `${device.name} → rack ${rackId} U${rackPosition}`,
  })
  return toSafe(device)
}

export async function clearDevicePlacementRecord(deviceId: string): Promise<SafeDevice> {
  const actor = await requireAdmin()
  const result = await prisma.device.updateMany({
    where: { id: deviceId },
    data: { rackId: null, rackPosition: null },
  })
  if (result.count === 0) throw new Error('Device not found')
  const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.unassign',
    target: device.name,
  })
  return toSafe(device)
}

export async function updateDeviceHeightRecord(
  deviceId: string,
  heightU: number,
): Promise<SafeDevice> {
  const actor = await requireAdmin()
  const parsedHeight = z.number().int().positive().safeParse(heightU)
  if (!parsedHeight.success) throw new Error('Invalid height')

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

    return tx.device.update({ where: { id: deviceId }, data: { heightU: parsedHeight.data } })
  })

  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'device.resize',
    target: `${device.name} → ${device.heightU}U`,
  })
  return toSafe(device)
}
