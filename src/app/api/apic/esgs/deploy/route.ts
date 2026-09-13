import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployEsgRows } from '@/lib/apic/esgs/apic'
import type { ParsedEsgRow, EsgDeployResult } from '@/lib/apic/esgs/types'

export const POST = withApicRoute<ParsedEsgRow, EsgDeployResult>(deployEsgRows)
