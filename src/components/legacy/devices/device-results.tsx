import type { LegacyDevicePageParams } from '@/lib/legacy/devices/params'
import { LegacyDeviceReadError, getLegacyDeviceResults } from '@/lib/legacy/devices/query'
import { LegacyDeviceResultsClient } from './devices-client'
import { LegacyDeviceRegionError } from './device-region-error'

export async function LegacyDeviceResults({
  paramsPromise,
}: {
  paramsPromise: Promise<LegacyDevicePageParams>
}) {
  const params = await paramsPromise
  let results: Awaited<ReturnType<typeof getLegacyDeviceResults>>
  try {
    results = await getLegacyDeviceResults(params)
  } catch (error) {
    if (!(error instanceof LegacyDeviceReadError)) throw error
    console.error('[legacy-devices] failed to load results', error)
    return <LegacyDeviceRegionError region="results" />
  }

  return <LegacyDeviceResultsClient results={results} />
}
