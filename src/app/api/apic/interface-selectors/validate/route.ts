import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateSelectorDeployRows } from '@/lib/apic/selectors/apic'
import type { ParsedSelectorRow, SelectorValidationResult } from '@/lib/apic/selectors/types'

export const POST = withApicRoute<ParsedSelectorRow, SelectorValidationResult>(validateSelectorDeployRows)
