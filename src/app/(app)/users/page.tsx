import type { Metadata } from 'next'
import { UsersView } from '@/components/users/users-view'

export const metadata: Metadata = {
  title: 'Users',
  description: 'Create application users and assign roles.',
}

export default function Page() {
  return <UsersView />
}
