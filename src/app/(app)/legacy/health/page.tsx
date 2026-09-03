import type { Metadata } from 'next'
import { LegacyHealthView } from '@/components/legacy/health/health-view'
import { parseLegacyHealthPageParams } from '@/lib/legacy/health/params'

export const metadata: Metadata = {
  title: 'Legacy Health',
  description: 'Latest and historical legacy-device health measurements.',
}

export default function Page({ searchParams }: PageProps<'/legacy/health'>) {
  return <LegacyHealthView paramsPromise={searchParams.then(parseLegacyHealthPageParams)} />
}
