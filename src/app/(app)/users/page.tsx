import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getUsers } from '@/actions/users'
import { UsersClient } from './UsersClient'

export const metadata: Metadata = {
  title: 'Users',
  description: 'Create application users and assign roles.',
}

export default async function UsersPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')
  if (session.user.role !== 'admin') notFound()

  const users = await getUsers()

  return <UsersClient initialUsers={users} currentUserId={session.user.id} />
}
