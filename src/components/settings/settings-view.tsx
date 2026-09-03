import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SettingsClient } from './settings-client'
import { SettingsContentSkeleton } from './settings-skeleton'

async function SettingsContent() {
  const session = await getSession()
  if (!session) redirect('/signin')

  return (
    <SettingsClient
      username={session.user.username ?? session.user.name}
      role={session.user.role === 'admin' ? 'admin' : 'member'}
    />
  )
}

export function SettingsView() {
  return (
    <div className="min-h-full bg-background">
      <div className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-subtle mt-0.5">Manage your account password</p>
          </div>
        </div>
      </div>
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsContent />
      </Suspense>
    </div>
  )
}
