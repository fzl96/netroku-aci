'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/crypto'
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
  username: string
  createdAt: Date
  updatedAt: Date
  userId: string
}

async function requireUser(): Promise<string> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')
  return session.user.id
}

function toSafe(host: { id: string; name: string; host: string; username: string; password: string; createdAt: Date; updatedAt: Date; userId: string }): SafeApicHost {
  const { password: _pw, ...safe } = host
  return safe
}

export async function getApicHosts(): Promise<SafeApicHost[]> {
  const userId = await requireUser()
  const hosts = await prisma.apicHost.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })
  return hosts.map(toSafe)
}

export async function createApicHost(
  data: ApicHostFormValues
): Promise<ActionResult<SafeApicHost>> {
  try {
    const userId = await requireUser()
    const parsed = apicHostSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const host = await prisma.apicHost.create({
      data: {
        name: parsed.data.name,
        host: parsed.data.host,
        username: parsed.data.username,
        password: encrypt(parsed.data.password),
        userId,
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
    const userId = await requireUser()
    const parsed = apicHostUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const updateData: Record<string, unknown> = {
      name: parsed.data.name,
      host: parsed.data.host,
      username: parsed.data.username,
    }
    if (parsed.data.password) {
      updateData.password = encrypt(parsed.data.password)
    }
    const result = await prisma.apicHost.updateMany({
      where: { id, userId },
      data: updateData,
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
    const userId = await requireUser()
    const result = await prisma.apicHost.deleteMany({ where: { id, userId } })
    if (result.count === 0) return { success: false, error: 'Host not found' }
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function getApicHostCredentials(
  id: string
): Promise<{ host: string; username: string; password: string } | null> {
  const userId = await requireUser()
  const apicHost = await prisma.apicHost.findFirst({ where: { id, userId } })
  if (!apicHost) return null
  return {
    host: apicHost.host,
    username: apicHost.username,
    password: decrypt(apicHost.password),
  }
}
