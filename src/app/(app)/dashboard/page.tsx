import type { Metadata } from 'next'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Global Netroku ACI operations dashboard.',
}

export default function DashboardPage() {
  return <DashboardShell />
}
