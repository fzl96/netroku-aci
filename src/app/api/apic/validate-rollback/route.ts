import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateRollbackRows } from '@/lib/apic/apic'
import type { ParsedRow, ValidationResult } from '@/lib/apic/types'

export const POST = withApicRoute<ParsedRow, ValidationResult>(validateRollbackRows)
