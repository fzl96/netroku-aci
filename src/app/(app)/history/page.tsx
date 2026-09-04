import type { Metadata } from 'next'
import { HistoryShell } from '@/components/history/history-shell'
import { parseHistoryPageParams } from '@/lib/history/params'

export const metadata: Metadata = {
  title: 'History',
  description: 'Activity log of actions taken across Netroku ACI.',
}

export default function Page({ searchParams }: PageProps<'/history'>) {
  return <HistoryShell paramsPromise={searchParams.then(parseHistoryPageParams)} />
}
