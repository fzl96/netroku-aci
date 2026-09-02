import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import { InterfaceReadError, type InterfaceCrcWindowData } from '@/lib/interface-health/query'
import { InterfaceCrcTrendClient } from './interface-health-client'
import { InterfaceRegionError } from './interface-region-error'

export async function InterfaceCrcTrend({
  paramsPromise,
  crcWindowPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  crcWindowPromise: Promise<InterfaceCrcWindowData | null>
}) {
  let data: [InterfaceHealthPageParams, InterfaceCrcWindowData | null]
  try {
    data = await Promise.all([paramsPromise, crcWindowPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load CRC trend', error)
    return <InterfaceRegionError region="trend" />
  }
  const [params, crcWindow] = data
  if (params.view !== 'crc' || !crcWindow) return null
  return <InterfaceCrcTrendClient trend={crcWindow.trend} />
}
