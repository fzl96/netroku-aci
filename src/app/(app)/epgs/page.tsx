import type { Metadata } from 'next'
import { EpgShell } from '@/components/epgs/epg-shell'
import { parseEpgPageParams } from '@/lib/epgs/params'

export const metadata: Metadata = {
  title: 'EPG',
  description: 'Deployed EPGs and their static port bindings across the fabric.',
}

export default function Page({ searchParams }: PageProps<'/epgs'>) {
  return <EpgShell paramsPromise={searchParams.then(parseEpgPageParams)} />
}
