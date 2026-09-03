import type { Metadata } from 'next'
import { HistoryView } from '@/components/history/history-view'
import { parseHistoryPageParams } from '@/lib/history/params'

export const metadata: Metadata = {
  title: 'History',
  description: 'Activity log of actions taken across Netroku ACI.',
}

export default function Page({ searchParams }: PageProps<'/history'>) {
  return (
    <HistoryView paramsPromise={searchParams.then(parseHistoryPageParams)} />
  )
}
