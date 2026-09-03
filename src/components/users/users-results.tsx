import { notFound, redirect } from 'next/navigation'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { getUsers, UserReadError } from '@/lib/users/query'
import { UsersClient } from './users-client'
import { UsersRegionError } from './users-region-error'

export async function UsersResults() {
  let currentUserId: string
  let role: string
  try {
    const session = await requireSession()
    currentUserId = session.id
    role = session.role
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    redirect('/signin')
  }
  if (role !== 'admin') notFound()

  let users: Awaited<ReturnType<typeof getUsers>>
  try {
    users = await getUsers()
  } catch (error) {
    if (!(error instanceof UserReadError)) throw error
    console.error('[users] failed to load users', error)
    return <UsersRegionError />
  }

  return <UsersClient initialUsers={users} currentUserId={currentUserId} />
}
