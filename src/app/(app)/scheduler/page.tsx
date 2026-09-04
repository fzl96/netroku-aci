import type { Metadata } from 'next'
import { SchedulerShell } from '@/components/scheduler/scheduler-shell'

export const metadata: Metadata = {
  title: 'Scheduler',
  description: 'Automatic resync schedules per APIC controller.',
}

export default function Page() {
  return <SchedulerShell />
}
