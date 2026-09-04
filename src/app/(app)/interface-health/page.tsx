import type { Metadata } from 'next'
import { InterfaceHealthShell } from '@/components/interface-health/interface-health-shell'
import { parseInterfaceHealthPageParams } from '@/lib/interface-health/params'

export const metadata: Metadata = {
  title: 'Interfaces',
  description: 'Per-interface status, error, and utilisation counters resynced from APIC.',
}

export default function Page({ searchParams }: PageProps<'/interface-health'>) {
  return <InterfaceHealthShell paramsPromise={searchParams.then(parseInterfaceHealthPageParams)} />
}
