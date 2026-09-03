import type { Metadata } from 'next'
import { LegacyInterfacesView } from '@/components/legacy/interfaces/interfaces-view'
import { parseLegacyInterfaceListState } from '@/lib/legacy/interfaces/params'

export const metadata: Metadata = {
  title: 'Legacy Interfaces',
  description: 'Current legacy interface state, counters, and historical trends.',
}

export default function Page({ searchParams }: PageProps<'/legacy/interfaces'>) {
  return <LegacyInterfacesView paramsPromise={searchParams.then(parseLegacyInterfaceListState)} />
}
