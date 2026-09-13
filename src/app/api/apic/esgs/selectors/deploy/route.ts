import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployEsgSelectorRows } from '@/lib/apic/esgs/apic'
import type { ParsedEsgSelectorRow, EsgDeployResult } from '@/lib/apic/esgs/types'

export const POST = withApicRoute<ParsedEsgSelectorRow, EsgDeployResult>(deployEsgSelectorRows)
