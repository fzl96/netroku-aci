import { withApicRoute } from '@/lib/apic/with-apic-route'
import { deployBridgeDomainL3Rows } from '@/lib/apic/bridge-domains/apic'
import type { ParsedBridgeDomainL3Row, BridgeDomainDeployResult } from '@/lib/apic/bridge-domains/types'

export const POST = withApicRoute<ParsedBridgeDomainL3Row, BridgeDomainDeployResult>(deployBridgeDomainL3Rows)
