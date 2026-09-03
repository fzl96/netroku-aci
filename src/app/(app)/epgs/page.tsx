import type { Metadata } from 'next'
import { EpgsView } from '@/components/epgs/epgs-view'
import { parseEpgPageParams } from '@/lib/epgs/params'

export const metadata: Metadata = {
  title: 'EPG',
  description: 'Deployed EPGs and their static port bindings across the fabric.',
}

export default function Page({ searchParams }: PageProps<'/epgs'>) {
  return <EpgsView paramsPromise={searchParams.then(parseEpgPageParams)} />
}
