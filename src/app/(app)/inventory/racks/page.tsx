import type { Metadata } from 'next'
import { RacksView } from '@/components/inventory/racks/racks-view'

export const metadata: Metadata = {
  title: 'Racks',
  description: 'Site-by-site rack elevation and device placement.',
}

export default function Page({ searchParams }: PageProps<'/inventory/racks'>) {
  return <RacksView searchParamsPromise={searchParams} />
}
