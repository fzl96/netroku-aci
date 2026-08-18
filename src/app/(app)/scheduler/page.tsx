import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getResyncSchedules } from '@/actions/resync-schedules'
import { SchedulerClient } from './SchedulerClient'

export const metadata: Metadata = {
  title: 'Scheduler',
  description: 'Automatic resync schedules per APIC controller.',
}

export default async function SchedulerPage() {
  const session = await getSession()
  if (!session) redirect('/signin')
  if (session.user.role !== 'admin') notFound()

  const schedules = await getResyncSchedules()

  return <SchedulerClient initialSchedules={schedules} />
}
