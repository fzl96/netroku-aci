import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LegacyInterfaceDetailShell } from '@/components/legacy/interfaces/interface-detail-shell'
import { LegacyInterfaceDetailSkeleton } from '@/components/legacy/interfaces/interfaces-skeleton'
import { parseLegacyInterfaceDetailParams } from '@/lib/legacy/interfaces/detail-params'

export const metadata: Metadata = {
  title: 'Legacy Interface',
  description: 'Error trend, port facts, and collected samples for a single legacy interface.',
}

export default function Page({ params, searchParams }: PageProps<'/legacy/interfaces/[id]'>) {
  return (
    <Suspense fallback={<LegacyInterfaceDetailSkeleton />}>
      <LegacyInterfaceDetailShell
        idPromise={params.then((p) => p.id)}
        paramsPromise={searchParams.then(parseLegacyInterfaceDetailParams)}
      />
    </Suspense>
  )
}
