import { parseRunningConfig } from './parser'
import { completePolicies, isIpv4, sortedIps, type Policy, type Service } from './policy'

export type ComplianceStatus = 'compliant' | 'noncompliant' | 'unknown' | 'not-evaluated'
export type ServiceResult = {
  service: Service
  status: ComplianceStatus
  reason: string | null
  expected: string[]
  detected: string[]
  missing: string[]
  unexpected: string[]
}
export type SavedConfig = { rawConfig: string; platform: string }

export function evaluateCompliance(
  config: SavedConfig | null,
  policies: Policy[],
  aciLinked = false,
): ServiceResult[] {
  const parsed = config && !aciLinked ? parseRunningConfig(config.rawConfig, config.platform) : null
  return completePolicies(policies).map((policy) => {
    const result: ServiceResult = {
      service: policy.service,
      status: 'not-evaluated',
      reason: null,
      expected: sortedIps(policy.expectedIps.filter(isIpv4)),
      detected: [],
      missing: [],
      unexpected: [],
    }
    if (aciLinked)
      return { ...result, reason: 'ACI configuration checks are not supported in this release' }
    if (!policy.enabled)
      return { ...result, reason: `${policy.service.toUpperCase()} check is disabled` }
    if (!policy.expectedIps.length || policy.expectedIps.some((ip) => !isIpv4(ip))) {
      return {
        ...result,
        status: 'unknown',
        reason: 'The enabled policy requires valid IPv4 addresses',
      }
    }
    if (!parsed) return { ...result, status: 'unknown', reason: 'No saved configuration' }
    result.detected = parsed[policy.service].ips
    if (parsed[policy.service].reason)
      return { ...result, status: 'unknown', reason: parsed[policy.service].reason }
    result.missing = result.expected.filter((ip) => !result.detected.includes(ip))
    result.unexpected = result.detected.filter((ip) => !result.expected.includes(ip))
    result.status = result.missing.length || result.unexpected.length ? 'noncompliant' : 'compliant'
    return result
  })
}
