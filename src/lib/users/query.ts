import 'server-only'

import { unstable_cache } from 'next/cache'
import { AuthenticationRequiredError, requireAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const USERS_CACHE_SECONDS = 28_800
const USERS_TAG = 'users:all'

export type SafeUser = {
  id: string
  username: string
  displayUsername: string
  role: 'admin' | 'member'
  createdAt: Date
}

export type UserReadErrorCode = 'unauthorized' | 'read-failed'

export class UserReadError extends Error {
  constructor(
    readonly code: UserReadErrorCode = 'unauthorized',
    options?: ErrorOptions,
  ) {
    super(code === 'unauthorized' ? 'Unauthorized' : 'Unable to load users', options)
    this.name = 'UserReadError'
  }
}

export function toSafeUser(user: {
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
  try {
    await requireAdmin()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new UserReadError()
  }

  try {
    return await unstable_cache(async () => {
      const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: { id: true, username: true, displayUsername: true, name: true, role: true, createdAt: true },
      })
      return users.map(toSafeUser)
    }, ['users', 'all'], { tags: [USERS_TAG], revalidate: USERS_CACHE_SECONDS })()
  } catch (error) {
    if (error instanceof UserReadError) throw error
    throw new UserReadError('read-failed', { cause: error })
  }
}
