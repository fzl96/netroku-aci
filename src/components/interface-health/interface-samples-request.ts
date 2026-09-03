import type { ErrorTrendPoint, ErrorTrendRange } from '@/lib/interface-health/error-trend'
import type { InterfaceStatusDetails } from '@/lib/interface-health/state-changes'

async function readSamples<T>(
  kind: 'errors' | 'status',
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<T> {
  const search = new URLSearchParams({ kind, interfaceId, range })
  const response = await fetch(`/api/interfaces/samples?${search.toString()}`)
  if (!response.ok) {
    throw new Error(`Interface ${kind} request failed with ${response.status}`)
  }
  return (await response.json()) as T
}

export function fetchInterfaceErrorSamples(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<ErrorTrendPoint[]> {
  return readSamples<ErrorTrendPoint[]>('errors', interfaceId, range)
}

export function fetchInterfaceStatusDetails(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<InterfaceStatusDetails> {
  return readSamples<InterfaceStatusDetails>('status', interfaceId, range)
}
