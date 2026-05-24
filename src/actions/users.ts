'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'

const roleSchema = z.enum(['admin', 'member'])

const createUserSchema = z.object({
  username: z.string().trim().min(3, 'Username must be at least 3 characters').max(30, 'Username must be 30 characters or fewer'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: roleSchema,
})

export type CreateUserValues = z.infer<typeof createUserSchema>

export type SafeUser = {
  id: string
  username: string
  displayUsername: string
  role: 'admin' | 'member'
  createdAt: Date
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

async function requireAdmin() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) throw new Error('Unauthorized')
  if (session.user.role !== 'admin') throw new Error('Forbidden')
  return {
    headers: requestHeaders,
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
  }
}

function toSafeUser(user: {
  id: string
  username: string | null
  displayUsername: string | null
  name: string
  role: string | null
  createdAt: Date
}): SafeUser {
  const username = user.username ?? user.name
  return {
    id: user.id,
    username,
    displayUsername: user.displayUsername ?? username,
    role: user.role === 'admin' ? 'admin' : 'member',
    createdAt: user.createdAt,
  }
}

export async function getUsers(): Promise<SafeUser[]> {
  await requireAdmin()
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      username: true,
      displayUsername: true,
      name: true,
      role: true,
      createdAt: true,
    },
  })
  return users.map(toSafeUser)
}

export async function createUser(data: CreateUserValues): Promise<ActionResult<SafeUser>> {
  try {
    const actor = await requireAdmin()

    const parsed = createUserSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }

    const username = parsed.data.username.trim()
    const created = await auth.api.createUser({
      body: {
        email: `${username}@local.test`,
        name: username,
        password: parsed.data.password,
        role: parsed.data.role,
        data: {
          username,
          displayUsername: username,
        },
      },
    })
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: created.user.id },
      select: {
        id: true,
        username: true,
        displayUsername: true,
        name: true,
        role: true,
        createdAt: true,
      },
    })

    await recordAudit({
      userId: actor.userId,
      userName: actor.userName,
      action: 'user.create',
      target: `${username} (${parsed.data.role})`,
    })

    return { success: true, data: toSafeUser(user) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteUser(id: string): Promise<ActionResult<void>> {
  try {
    const admin = await requireAdmin()
    if (!id) return { success: false, error: 'User not found' }
    if (id === admin.userId) return { success: false, error: 'You cannot delete your own account' }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { username: true, name: true },
    })

    await auth.api.removeUser({
      headers: admin.headers,
      body: { userId: id },
    })

    await recordAudit({
      userId: admin.userId,
      userName: admin.userName,
      action: 'user.delete',
      target: target?.username ?? target?.name ?? id,
    })

    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
