import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deploySelectorRows } from '@/lib/apic/selectors/apic'
import type { ParsedSelectorRow, SelectorDeployResult } from '@/lib/apic/selectors/types'

export const POST = withApicRoute<ParsedSelectorRow, SelectorDeployResult>(deploySelectorRows)
