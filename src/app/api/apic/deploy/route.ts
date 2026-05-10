import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployRows } from '@/lib/apic/apic'
import type { ParsedRow, DeployResult } from '@/lib/apic/types'

export const POST = withApicRoute<ParsedRow, DeployResult>(deployRows)
