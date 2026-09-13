import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateEsgSelectorDeployRows } from '@/lib/apic/esgs/apic'
import type { ParsedEsgSelectorRow, EsgValidationResult } from '@/lib/apic/esgs/types'

export const POST = withApicRoute<ParsedEsgSelectorRow, EsgValidationResult>(
  validateEsgSelectorDeployRows,
)
