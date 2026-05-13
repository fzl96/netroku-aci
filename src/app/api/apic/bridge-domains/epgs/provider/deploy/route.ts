import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployLegacyEpgContractRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgContractRow, EpgDeployResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgContractRow, EpgDeployResult>(
  (rows, h, t) => deployLegacyEpgContractRows(rows, h, t, 'provider'),
)
