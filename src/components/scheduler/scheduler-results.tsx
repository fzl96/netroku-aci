import { notFound, redirect } from 'next/navigation'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
import { getResyncSchedules, SchedulerReadError } from '@/lib/scheduler/query'
import { SchedulerClient } from './scheduler-client'
import { SchedulerRegionError } from './scheduler-region-error'

export async function SchedulerResults() {
  let role: string
  try {
    role = (await requireSession()).role
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    redirect('/signin')
  }
  if (role !== 'admin') notFound()

  let schedules: Awaited<ReturnType<typeof getResyncSchedules>>
  try {
    schedules = await getResyncSchedules()
  } catch (error) {
    if (!(error instanceof SchedulerReadError)) throw error
    console.error('[scheduler] failed to load resync schedules', error)
    return <SchedulerRegionError />
  }

  return <SchedulerClient initialSchedules={schedules} />
}
