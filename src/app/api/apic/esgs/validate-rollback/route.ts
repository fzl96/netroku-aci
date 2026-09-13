import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateEsgRollbackRows } from '@/lib/apic/esgs/apic'
import type { ParsedEsgRow, EsgValidationResult } from '@/lib/apic/esgs/types'

export const POST = withApicRoute<ParsedEsgRow, EsgValidationResult>(validateEsgRollbackRows)
