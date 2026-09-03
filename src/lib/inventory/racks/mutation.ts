import 'server-only'

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'
import {
  rackSchema,
  rackUpdateSchema,
  type RackFormValues,
  type RackUpdateFormValues,
} from '@/lib/schemas/rack'
import { toSafeRack, type SafeRack } from './query'

export async function createRackRecord(data: RackFormValues): Promise<SafeRack> {
  const actor = await requireAdmin()
  const parsed = rackSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const rack = await prisma.rack.create({
    data: {
      name: parsed.data.name,
      heightU: parsed.data.heightU,
      siteId: parsed.data.siteId,
    },
  })
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'rack.create',
    target: rack.name,
  })
  return toSafeRack(rack)
}

export async function updateRackRecord(id: string, data: RackUpdateFormValues): Promise<SafeRack> {
  const actor = await requireAdmin()
  const parsed = rackUpdateSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const result = await prisma.rack.updateMany({
    where: { id },
    data: {
      name: parsed.data.name,
      heightU: parsed.data.heightU,
      siteId: parsed.data.siteId,
    },
  })
  if (result.count === 0) throw new Error('Rack not found')
  const rack = await prisma.rack.findUniqueOrThrow({ where: { id } })
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'rack.update',
    target: rack.name,
  })
  return toSafeRack(rack)
}

export async function deleteRackRecord(id: string): Promise<void> {
  const actor = await requireAdmin()
  const existing = await prisma.rack.findUnique({ where: { id } })
  const result = await prisma.rack.deleteMany({ where: { id } })
  if (result.count === 0) throw new Error('Rack not found')
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'rack.delete',
    target: existing?.name ?? id,
  })
}
