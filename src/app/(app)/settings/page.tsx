import type { Metadata } from 'next'
import { SettingsShell } from '@/components/settings/settings-shell'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account password.',
}

export default function Page() {
  return <SettingsShell />
}
