import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import { InterfaceReadError, type InterfaceResultsData } from '@/lib/interface-health/query'

export async function InterfaceSummary({
  paramsPromise,
  resultsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  resultsPromise: Promise<InterfaceResultsData | null>
}) {
  let data: [InterfaceHealthPageParams, InterfaceResultsData | null]
  try {
    data = await Promise.all([paramsPromise, resultsPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    return null
  }
  const [params, results] = data
  if (!results) return null

  const scope =
    params.view === 'crc'
      ? ` (CRC increase in last ${params.window})`
      : params.view === 'state-changed'
        ? ` (state changed in last ${params.window})`
        : ''

  return (
    <span>
      <span className="font-semibold text-foreground">{results.total}</span>{' '}
      {results.total === 1 ? 'interface' : 'interfaces'}
      {scope}
    </span>
  )
}
