import type { Metadata } from 'next'
import { ComplianceReportShell } from '@/components/inventory/compliance/report-shell'
import { parseReportParams } from '@/lib/inventory/compliance/report'

export const metadata: Metadata = {
  title: 'Compliance status',
  description: 'Check inventory NTP and TACACS configuration compliance.',
}

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return <ComplianceReportShell paramsPromise={searchParams.then(parseReportParams)} />
}
