import { withApicRoute } from '@/lib/apic/with-apic-route'
import { validateBridgeDomainL2RollbackRows } from '@/lib/apic/bridge-domains/apic'
import type { ParsedBridgeDomainL2Row, BridgeDomainValidationResult } from '@/lib/apic/bridge-domains/types'

export const POST = withApicRoute<ParsedBridgeDomainL2Row, BridgeDomainValidationResult>(validateBridgeDomainL2RollbackRows)
