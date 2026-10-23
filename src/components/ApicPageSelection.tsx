import { RecordApicSelection } from '@/components/ApicSelectionProvider'

/** Persist only after the server validates the URL, before inventory reads finish. */
export async function ApicPageSelection({
  pagePromise,
}: {
  pagePromise: Promise<{ kind: string; params?: { hostId: string } }>
}) {
  const context = await pagePromise
  if (context.kind !== 'ready' || !context.params) return null
  return <RecordApicSelection hostId={context.params.hostId} />
}
