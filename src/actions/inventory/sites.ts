'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  siteSchema,
  siteUpdateSchema,
  type SiteFormValues,
  type SiteUpdateFormValues,
} from '@/lib/schemas/site'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeSite = {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
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

function toSafe(site: {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
}): SafeSite {
  return {
    id: site.id,
    name: site.name,
    address: site.address,
    latitude: site.latitude,
    longitude: site.longitude,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }
}

export async function getSites(): Promise<SafeSite[]> {
  await requireSession()
  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } })
  return sites.map(toSafe)
}

export async function createSite(data: SiteFormValues): Promise<ActionResult<SafeSite>> {
  try {
    const actor = await requireAdmin()
    const parsed = siteSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const site = await prisma.site.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.create',
      target: site.name,
    })
    return { success: true, data: toSafe(site) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateSite(
  id: string,
  data: SiteUpdateFormValues,
): Promise<ActionResult<SafeSite>> {
  try {
    const actor = await requireAdmin()
    const parsed = siteUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.site.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    })
    if (result.count === 0) return { success: false, error: 'Site not found' }
    const site = await prisma.site.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.update',
      target: site.name,
    })
    return { success: true, data: toSafe(site) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteSite(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.site.findUnique({ where: { id } })
    const result = await prisma.site.deleteMany({ where: { id } }).catch((err) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2003') {
        throw new Error('Cannot delete a site that still has racks')
      }
      throw err
    })
    if (result.count === 0) return { success: false, error: 'Site not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.delete',
      target: existing?.name ?? id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
