'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { apicHostSchema, type ApicHostFormValues } from '@/lib/schemas/apic-host'
import type { ApicHost } from '@prisma/client'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}

export async function getApicHosts(): Promise<ApicHost[]> {
  const userId = await requireUser()
  return prisma.apicHost.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function createApicHost(
  data: ApicHostFormValues
): Promise<ActionResult<ApicHost>> {
  try {
    const userId = await requireUser()
    const parsed = apicHostSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const host = await prisma.apicHost.create({
      data: { ...parsed.data, userId },
    })
    return { success: true, data: host }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateApicHost(
  id: string,
  data: ApicHostFormValues
): Promise<ActionResult<ApicHost>> {
  try {
    const userId = await requireUser()
    const parsed = apicHostSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.apicHost.updateMany({
      where: { id, userId },
      data: parsed.data,
    })
    if (result.count === 0) return { success: false, error: 'Host not found' }
    const host = await prisma.apicHost.findUniqueOrThrow({ where: { id } })
    return { success: true, data: host }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteApicHost(id: string): Promise<ActionResult<void>> {
  try {
    const userId = await requireUser()
    const result = await prisma.apicHost.deleteMany({ where: { id, userId } })
    if (result.count === 0) return { success: false, error: 'Host not found' }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
