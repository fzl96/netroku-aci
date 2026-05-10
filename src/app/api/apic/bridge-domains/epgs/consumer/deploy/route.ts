import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployEpgRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgContractRow, EpgDeployResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgContractRow, EpgDeployResult>(
  (rows, h, t) => deployEpgRows(rows, h, t, 'consumer'),
)
