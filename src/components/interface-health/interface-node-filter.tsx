import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import {
  InterfaceReadError,
  type InterfaceOverviewData,
} from '@/lib/interface-health/query'
import { InterfaceNodeFilterClient } from './interface-health-client'
import { InterfaceRegionError } from './interface-region-error'

export async function InterfaceNodeFilter({
  paramsPromise,
  overviewPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
  overviewPromise: Promise<InterfaceOverviewData | null>
}) {
  let data: [InterfaceHealthPageParams, InterfaceOverviewData | null]
  try {
    data = await Promise.all([paramsPromise, overviewPromise])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load filter metadata', error)
    return <InterfaceRegionError region="filters" compact />
  }
  const [params, overview] = data
  return (
    <InterfaceNodeFilterClient params={params} availableNodes={overview?.availableNodes ?? []} />
  )
}
