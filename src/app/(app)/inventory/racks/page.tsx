import type { Metadata } from 'next'
import { RacksShell } from '@/components/inventory/racks/racks-shell'
import { parseRacksSearchParams } from '@/lib/inventory/racks/params'

export const metadata: Metadata = {
  title: 'Racks',
  description: 'Site-by-site rack elevation and device placement.',
}

export default function Page({ searchParams }: PageProps<'/inventory/racks'>) {
  return <RacksShell paramsPromise={searchParams.then(parseRacksSearchParams)} />
}
