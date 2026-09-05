import { Suspense } from 'react'
import type { Metadata } from 'next'
import { InterfaceDetailShell } from '@/components/interface-health/interface-detail-shell'
import { InterfaceDetailSkeleton } from '@/components/interface-health/interface-health-skeleton'
import { parseInterfaceDetailParams } from '@/lib/interface-health/detail-params'

export const metadata: Metadata = {
  title: 'Interface',
  description: 'Error trend, port facts, and state history for a single interface.',
}

export default function Page({ params, searchParams }: PageProps<'/interface-health/[id]'>) {
  return (
    <Suspense fallback={<InterfaceDetailSkeleton />}>
      <InterfaceDetailShell
        idPromise={params.then((p) => p.id)}
        paramsPromise={searchParams.then(parseInterfaceDetailParams)}
      />
    </Suspense>
  )
}
