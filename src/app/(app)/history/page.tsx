import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getAuditLogs } from '@/actions/audit'
import { HistoryClient } from './HistoryClient'

export const metadata: Metadata = {
  title: 'History',
  description: 'Activity log of actions taken across Netroku ACI.',
}

export default async function HistoryPage() {
  const session = await getSession()
  if (!session) redirect('/signin')

  const logs = await getAuditLogs()

  return <HistoryClient initialLogs={logs} />
}
