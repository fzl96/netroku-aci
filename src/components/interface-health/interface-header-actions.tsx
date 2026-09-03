import type { InterfaceHealthPageParams } from '@/lib/interface-health/params'
import { InterfaceHeaderActionsClient } from './interface-health-client'

export async function InterfaceHeaderActions({
  paramsPromise,
}: {
  paramsPromise: Promise<InterfaceHealthPageParams>
}) {
  return <InterfaceHeaderActionsClient params={await paramsPromise} />
}
