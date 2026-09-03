import type { Metadata } from 'next'
import { SettingsView } from '@/components/settings/settings-view'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account password.',
}

export default function Page() {
  return <SettingsView />
}
