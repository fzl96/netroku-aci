import type { Metadata } from 'next'
import { CompliancePolicyShell } from '@/components/inventory/compliance/policy-shell'

export const metadata: Metadata = {
  title: 'Compliance parameters',
  description: 'Manage global NTP and TACACS compliance policies.',
}

export default function Page() {
  return <CompliancePolicyShell />
}
