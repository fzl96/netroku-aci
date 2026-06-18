import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateEpgContractRollbackRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgContractRow, EpgValidationResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgContractRow, EpgValidationResult>(
  (rows, h, t) => validateEpgContractRollbackRows(rows, h, t, 'provider'),
)
