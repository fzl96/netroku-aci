import type { Metadata } from 'next'
import { BdShell } from '@/components/bds/bd-shell'
import { parseBdPageParams } from '@/lib/bds/params'

export const metadata: Metadata = {
  title: 'Bridge Domains',
  description: 'Read-only Bridge Domain configuration and connected EPGs.',
}
export default function Page({ searchParams }: PageProps<'/bds'>) {
  return <BdShell paramsPromise={searchParams.then(parseBdPageParams)} />
}
