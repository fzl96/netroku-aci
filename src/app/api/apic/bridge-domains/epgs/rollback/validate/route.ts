import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateEpgRollbackRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgRow, EpgValidationResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgRow, EpgValidationResult>(validateEpgRollbackRows)
