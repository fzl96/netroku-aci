import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateBridgeDomainL3RollbackRows } from '@/lib/apic/bridge-domains/apic'
import type { ParsedBridgeDomainL3Row, BridgeDomainValidationResult } from '@/lib/apic/bridge-domains/types'

export const POST = withApicRoute<ParsedBridgeDomainL3Row, BridgeDomainValidationResult>(validateBridgeDomainL3RollbackRows)
