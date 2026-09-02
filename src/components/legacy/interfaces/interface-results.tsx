import type { LegacyInterfaceListState } from '@/lib/legacy/interfaces/params'
import { LegacyInterfaceReadError, getLegacyInterfaceResults } from '@/lib/legacy/interfaces/query'
import { LegacyInterfaceResultsClient } from './interfaces-client'
import { LegacyInterfaceRegionError } from './interface-region-error'

export async function LegacyInterfaceResults({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyInterfaceListState>
}) {
  const state = await paramsPromise
  let results: Awaited<ReturnType<typeof getLegacyInterfaceResults>>
  try {
    results = await getLegacyInterfaceResults(state)
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load results', error)
    return <LegacyInterfaceRegionError region="results" />
  }

  return <LegacyInterfaceResultsClient state={state} results={results} />
}
