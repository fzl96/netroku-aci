import type { Metadata } from 'next'
import { SchedulerView } from '@/components/scheduler/scheduler-view'

export const metadata: Metadata = {
  title: 'Scheduler',
  description: 'Automatic resync schedules per APIC controller.',
}

export default function Page() {
  return <SchedulerView />
}
