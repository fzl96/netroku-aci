import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SettingsClient } from './SettingsClient'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account password.',
}

export default async function SettingsPage() {
  const session = await getSession()
  if (!session) redirect('/signin')

  return (
    <SettingsClient
      username={session.user.username ?? session.user.name}
      role={session.user.role === 'admin' ? 'admin' : 'member'}
    />
  )
}
