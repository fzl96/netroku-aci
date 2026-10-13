import { z } from 'zod'

export const COMPLIANCE_SERVICES = ['ntp', 'tacacs'] as const
export type Service = (typeof COMPLIANCE_SERVICES)[number]
export type Policy = { service: Service; enabled: boolean; expectedIps: string[] }
export const SERVICE_LABELS: Record<Service, string> = { ntp: 'NTP', tacacs: 'TACACS' }

export function isIpv4(value: string): boolean {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every((part) => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
  )
}

export function sortedIps(ips: Iterable<string>): string[] {
  return [...new Set(ips)].sort((a, b) => {
    const left = a.split('.').map(Number)
    const right = b.split('.').map(Number)
    for (let i = 0; i < 4; i++) if (left[i] !== right[i]) return left[i] - right[i]
    return 0
  })
}

export const policySchema = z
  .object({
    service: z.enum(COMPLIANCE_SERVICES),
    enabled: z.boolean(),
    expectedIps: z
      .array(z.string().trim().refine(isIpv4, 'Enter valid IPv4 addresses only'))
      .max(256)
      .transform(sortedIps),
  })
  .strict()
  .refine((policy) => !policy.enabled || policy.expectedIps.length > 0, {
    message: 'An enabled check requires at least one IPv4 address',
    path: ['expectedIps'],
  })

export function completePolicies(stored: Policy[]): Policy[] {
  return COMPLIANCE_SERVICES.map(
    (service) =>
      stored.find((policy) => policy.service === service) ?? {
        service,
        enabled: false,
        expectedIps: [],
      },
  )
}
