'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  apicHostSchema,
  apicHostUpdateSchema,
  type ApicHostFormValues,
  type ApicHostUpdateFormValues,
} from '@/lib/schemas/apic-host'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeApicHost = {
  id: string
  name: string
  host: string
  createdAt: Date
  updatedAt: Date
}

async function requireSession(): Promise<{ id: string; role: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')
  return {
    id: session.user.id,
    role: session.user.role ?? 'member',
  }
}

async function requireAdmin(): Promise<void> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new Error('Forbidden')
}

function toSafe(host: { id: string; name: string; host: string; createdAt: Date; updatedAt: Date }): SafeApicHost {
  return {
    id: host.id,
    name: host.name,
    host: host.host,
    createdAt: host.createdAt,
    updatedAt: host.updatedAt,
  }
}

export async function getApicHosts(): Promise<SafeApicHost[]> {
  await requireSession()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return hosts.map(toSafe)
}

export async function createApicHost(
  data: ApicHostFormValues
): Promise<ActionResult<SafeApicHost>> {
  try {
    await requireAdmin()
    const parsed = apicHostSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const host = await prisma.apicHost.create({
      data: {
        name: parsed.data.name,
        host: parsed.data.host,
      },
    })
    return { success: true, data: toSafe(host) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateApicHost(
  id: string,
  data: ApicHostUpdateFormValues
): Promise<ActionResult<SafeApicHost>> {
  try {
    await requireAdmin()
    const parsed = apicHostUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.apicHost.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        host: parsed.data.host,
      },
    })
    if (result.count === 0) return { success: false, error: 'Host not found' }
    const host = await prisma.apicHost.findUniqueOrThrow({ where: { id } })
    return { success: true, data: toSafe(host) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteApicHost(id: string): Promise<ActionResult<void>> {
  try {
    await requireAdmin()
    const result = await prisma.apicHost.deleteMany({ where: { id } })
    if (result.count === 0) return { success: false, error: 'Host not found' }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
