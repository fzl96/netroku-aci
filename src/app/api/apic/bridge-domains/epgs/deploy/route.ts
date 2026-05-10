import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployEpgOnlyRows } from '@/lib/apic/epgs/apic'
import type { ParsedEpgRow, EpgDeployResult } from '@/lib/apic/epgs/types'

export const POST = withApicRoute<ParsedEpgRow, EpgDeployResult>(deployEpgOnlyRows)
