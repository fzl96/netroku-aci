import type { Metadata } from 'next'
import { UsersShell } from '@/components/users/users-shell'

export const metadata: Metadata = {
  title: 'Users',
  description: 'Create application users and assign roles.',
}

export default function Page() {
  return <UsersShell />
}
