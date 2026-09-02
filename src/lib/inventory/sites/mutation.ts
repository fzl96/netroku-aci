import 'server-only'

import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { invalidateInventoryReads } from '@/lib/inventory/mutation'
import {
  siteSchema,
  siteUpdateSchema,
  type SiteFormValues,
  type SiteUpdateFormValues,
} from '@/lib/schemas/site'
import { toSafeSite, type SafeSite } from './query'

export async function createSiteRecord(data: SiteFormValues): Promise<SafeSite> {
  const actor = await requireAdmin()
  const parsed = siteSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const site = await prisma.site.create({
    data: {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
    },
  })
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'site.create',
    target: site.name,
  })
  return toSafeSite(site)
}

export async function updateSiteRecord(
  id: string,
  data: SiteUpdateFormValues,
): Promise<SafeSite> {
  const actor = await requireAdmin()
  const parsed = siteUpdateSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const result = await prisma.site.updateMany({
    where: { id },
    data: {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      latitude: parsed.data.latitude ?? null,
      longitude: parsed.data.longitude ?? null,
    },
  })
  if (result.count === 0) throw new Error('Site not found')
  const site = await prisma.site.findUniqueOrThrow({ where: { id } })
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'site.update',
    target: site.name,
  })
  return toSafeSite(site)
}

export async function deleteSiteRecord(id: string): Promise<void> {
  const actor = await requireAdmin()
  const existing = await prisma.site.findUnique({ where: { id } })
  const result = await prisma.site.deleteMany({ where: { id } }).catch((err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2003') {
      throw new Error('Cannot delete a site that still has racks')
    }
    throw err
  })
  if (result.count === 0) throw new Error('Site not found')
  invalidateInventoryReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'site.delete',
    target: existing?.name ?? id,
  })
}
