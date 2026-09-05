import type { Metadata } from 'next'
import { LegacyHealthShell } from '@/components/legacy/health/health-shell'
import { parseLegacyHealthPageParams } from '@/lib/legacy/health/params'

export const metadata: Metadata = {
  title: 'Legacy Health',
  description: 'Latest and historical legacy-device health measurements.',
}

export default function Page({ searchParams }: PageProps<'/legacy/health'>) {
  return <LegacyHealthShell paramsPromise={searchParams.then(parseLegacyHealthPageParams)} />
}
