import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployBridgeDomainL2Rows } from '@/lib/apic/bridge-domains/apic'
import type { ParsedBridgeDomainL2Row, BridgeDomainDeployResult } from '@/lib/apic/bridge-domains/types'

export const POST = withApicRoute<ParsedBridgeDomainL2Row, BridgeDomainDeployResult>(deployBridgeDomainL2Rows)
