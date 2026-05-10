import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateEpgDeployRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgContractRow, EpgValidationResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgContractRow, EpgValidationResult>(
  (rows, h, t) => validateEpgDeployRows(rows, h, t, 'consumer'),
)
