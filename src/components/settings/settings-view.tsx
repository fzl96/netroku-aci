import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { SettingsClient } from './settings-client'

/** No purpose-owned read here: the only server-derived value is the session
 *  itself, already resolved once per request by `@/lib/auth`'s `getSession`.
 *  There is no variable-latency fetch to stream past, so this stays a plain
 *  async render module rather than a Suspense region. */
export async function SettingsView() {
  const session = await getSession()
  if (!session) redirect('/signin')

  return (
    <SettingsClient
      username={session.user.username ?? session.user.name}
      role={session.user.role === 'admin' ? 'admin' : 'member'}
    />
  )
}
