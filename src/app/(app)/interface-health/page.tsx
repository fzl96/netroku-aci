import type { Metadata } from 'next'
import { InterfaceHealthView } from '@/components/interface-health/interface-health-view'
import { parseInterfaceHealthPageParams } from '@/lib/interface-health/params'

export const metadata: Metadata = {
  title: 'Interfaces',
  description: 'Per-interface status, error, and utilisation counters resynced from APIC.',
}

export default function Page({ searchParams }: PageProps<'/interface-health'>) {
  return <InterfaceHealthView paramsPromise={searchParams.then(parseInterfaceHealthPageParams)} />
}
