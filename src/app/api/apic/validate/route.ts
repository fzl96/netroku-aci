import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateDeployRows } from '@/lib/apic/apic'
import type { ParsedRow, ValidationResult } from '@/lib/apic/types'

export const POST = withApicRoute<ParsedRow, ValidationResult>(validateDeployRows)
