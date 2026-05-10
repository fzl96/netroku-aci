import { withApicRoute } from '@/lib/apic/with-apic-route'
import { rollbackBridgeDomainRows } from '@/lib/apic/bridge-domains/apic'
import type { ParsedBridgeDomainL2Row, BridgeDomainDeployResult } from '@/lib/apic/bridge-domains/types'

export const POST = withApicRoute<ParsedBridgeDomainL2Row, BridgeDomainDeployResult>(
  (rows, h, t) => rollbackBridgeDomainRows(rows, h, t),
)
