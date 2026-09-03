import 'server-only'

import { headers } from 'next/headers'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { auth, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { toSafeUser, type SafeUser } from './query'

const roleSchema = z.enum(['admin', 'member'])

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be 30 characters or fewer'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: roleSchema,
})

export type CreateUserValues = z.infer<typeof createUserSchema>

export function invalidateUserReads(): void {
  revalidateTag('users:all', { expire: 0 })
}

export async function createUserRecord(data: CreateUserValues): Promise<SafeUser> {
  const actor = await requireAdmin()
  const parsed = createUserSchema.safeParse(data)
  if (!parsed.success) throw new Error('Invalid data')

  const username = parsed.data.username.trim()
  const created = await auth.api.createUser({
    body: {
      email: `${username}@local.test`,
      name: username,
      password: parsed.data.password,
      role: parsed.data.role,
      data: { username, displayUsername: username },
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

  invalidateUserReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'user.create',
    target: `${username} (${parsed.data.role})`,
  })

  return toSafeUser(user)
}

export async function deleteUserRecord(id: string): Promise<void> {
  const actor = await requireAdmin()
  if (!id) throw new Error('User not found')
  if (id === actor.id) throw new Error('You cannot delete your own account')

  const target = await prisma.user.findUnique({
    where: { id },
    select: { username: true, name: true },
  })

  await auth.api.removeUser({
    headers: await headers(),
    body: { userId: id },
  })

  invalidateUserReads()
  await recordAudit({
    userId: actor.id,
    userName: actor.userName,
    action: 'user.delete',
    target: target?.username ?? target?.name ?? id,
  })
}
