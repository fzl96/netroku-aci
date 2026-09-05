import type { Metadata } from 'next'
import { LegacyInterfacesShell } from '@/components/legacy/interfaces/interfaces-shell'
import { parseLegacyInterfaceListState } from '@/lib/legacy/interfaces/params'

export const metadata: Metadata = {
  title: 'Legacy Interfaces',
  description: 'Current legacy interface state, counters, and historical trends.',
}

export default function Page({ searchParams }: PageProps<'/legacy/interfaces'>) {
  return <LegacyInterfacesShell paramsPromise={searchParams.then(parseLegacyInterfaceListState)} />
}
