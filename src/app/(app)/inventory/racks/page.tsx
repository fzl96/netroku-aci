import type { Metadata } from 'next'
import { RacksView } from '@/components/inventory/racks/racks-view'
import { parseRacksSearchParams } from '@/lib/inventory/racks/params'

export const metadata: Metadata = {
  title: 'Racks',
  description: 'Site-by-site rack elevation and device placement.',
}

export default function Page({ searchParams }: PageProps<'/inventory/racks'>) {
  return <RacksView paramsPromise={searchParams.then(parseRacksSearchParams)} />
}
