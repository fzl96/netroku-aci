import { Suspense } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { InventoryReadError } from '@/lib/inventory/errors'
import { getComplianceReport } from '@/lib/inventory/compliance/query'
import { reportUrl, type ReportParams } from '@/lib/inventory/compliance/report'
import { SERVICE_LABELS } from '@/lib/inventory/compliance/policy'
import type { ServiceResult } from '@/lib/inventory/compliance/evaluate'
import { RefreshReport } from './refresh-report'

const statusLabels = {
  compliant: 'Compliant',
  noncompliant: 'Noncompliant',
  unknown: 'Unknown',
  'not-evaluated': 'Not evaluated',
}
const statusClasses = {
  compliant: 'text-emerald-700 dark:text-emerald-400',
  noncompliant: 'text-destructive',
  unknown: 'text-amber-700 dark:text-amber-400',
  'not-evaluated': 'text-subtle',
}

function ServiceComparison({ result }: { result: ServiceResult }) {
  return (
    <details className="max-w-80 min-w-44">
      <summary className={`cursor-pointer font-semibold ${statusClasses[result.status]}`}>
        {statusLabels[result.status]}
      </summary>
      {result.reason && <p className="mt-2 text-xs leading-relaxed text-subtle">{result.reason}</p>}
      <dl className="mt-3 space-y-2 text-xs">
        {(
          [
            ['Expected', result.expected],
            ['Detected', result.detected],
            ['Missing', result.missing],
            ['Unexpected', result.unexpected],
          ] as const
        ).map(([label, ips]) => (
          <div key={label}>
            <dt className="text-subtle">{label}</dt>
            <dd className="mt-0.5 font-mono text-foreground">
              {ips.length ? ips.join(', ') : '—'}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

async function ReportContent({ paramsPromise }: { paramsPromise: Promise<ReportParams> }) {
  const params = await paramsPromise
  let report: Awaited<ReturnType<typeof getComplianceReport>>
  try {
    report = await getComplianceReport(params)
  } catch (error) {
    if (!(error instanceof InventoryReadError)) throw error
    return (
      <div className="px-4 py-8 md:px-8" role="alert">
        <p className="text-sm text-foreground">
          {error.code === 'unauthorized'
            ? 'Sign in to view compliance status.'
            : 'Unable to load compliance status. Try again.'}
        </p>
        {error.code === 'read-failed' && (
          <div className="mt-3">
            <RefreshReport />
          </div>
        )}
      </div>
    )
  }
  const formatDate = (value: string) =>
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }).format(new Date(value))

  return (
    <div className="space-y-5 px-4 py-4 md:px-8 md:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-subtle">
          Latest saved configurations checked against the current global parameters. Each stack
          shares one result. Expand a service result to compare its IPs.
        </p>
        <div className="flex flex-wrap gap-2">
          <RefreshReport />
          {report.isAdmin && (
            <Button variant="outline" asChild>
              <Link href="/inventory/compliance/parameters">Edit parameters</Link>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-y border-border py-3 text-xs">
        {report.policies.map((policy) => (
          <p key={policy.service}>
            <span className="font-semibold text-foreground">{SERVICE_LABELS[policy.service]}</span>{' '}
            <span className="text-subtle">
              {policy.enabled
                ? `${policy.expectedIps.length} required IP${policy.expectedIps.length === 1 ? '' : 's'}`
                : 'Check disabled'}
            </span>
          </p>
        ))}
      </div>
      <form action="/inventory/compliance" className="flex max-w-lg items-center gap-2">
        <label htmlFor="compliance-search" className="sr-only">
          Search devices, stacks, or members
        </label>
        <input
          id="compliance-search"
          type="search"
          name="q"
          defaultValue={report.query}
          placeholder="Search devices, stacks, or members…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
        {report.query && (
          <Button variant="ghost" asChild>
            <Link href="/inventory/compliance">Clear</Link>
          </Button>
        )}
      </form>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className={TABLE_SCROLL_CLS}>
          <table className="w-full text-xs">
            <caption className="sr-only">Inventory NTP and TACACS configuration compliance</caption>
            <thead>
              <tr>
                {['Device / stack', 'Platform', 'Config collected (UTC)', 'NTP', 'TACACS'].map(
                  (label) => (
                    <th key={label} scope="col" className={DENSE_TABLE_HEAD_CLS}>
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {!report.rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-subtle">
                    {report.query
                      ? 'No devices or stacks match this search.'
                      : 'Add inventory devices to check their compliance.'}
                  </td>
                </tr>
              )}
              {report.rows.map((row) => (
                <tr
                  key={`${row.kind}:${row.id}`}
                  className="border-b border-border-faint last:border-0"
                >
                  <th scope="row" className="min-w-48 px-4 py-4 text-left align-top font-normal">
                    {row.kind === 'device' ? (
                      <Link
                        className="font-semibold text-foreground hover:underline"
                        href={`/inventory/devices/${row.id}`}
                      >
                        {row.name}
                      </Link>
                    ) : (
                      <span className="font-semibold text-foreground">{row.name}</span>
                    )}
                    {row.kind === 'stack' && (
                      <div className="mt-1 space-y-1 text-subtle">
                        <p>Shared stack configuration</p>
                        <ul>
                          {row.members.map((member) => (
                            <li key={member.id}>
                              <Link
                                href={`/inventory/devices/${member.id}`}
                                className="hover:underline"
                              >
                                {member.name}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </th>
                  <td className="px-4 py-4 align-top whitespace-nowrap text-subtle">
                    {row.platform === 'iosxe' ? 'IOS-XE' : row.platform === 'nxos' ? 'NX-OS' : '—'}
                  </td>
                  <td className="px-4 py-4 align-top whitespace-nowrap text-subtle">
                    {row.collectedAt ? (
                      <time dateTime={row.collectedAt} title={row.collectedAt}>
                        {formatDate(row.collectedAt)}
                      </time>
                    ) : (
                      'No saved configuration'
                    )}
                  </td>
                  {row.results.map((result) => (
                    <td key={result.service} className="px-4 py-4 align-top">
                      <ServiceComparison result={result} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-subtle">
        <p>
          {report.total} device{report.total === 1 ? '' : 's'} / stack
          {report.total === 1 ? '' : 's'} · Page {report.page} of {report.totalPages}
        </p>
        <div className="flex gap-2">
          {report.page > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link href={reportUrl({ query: report.query, page: report.page - 1 })}>Previous</Link>
            </Button>
          )}
          {report.page < report.totalPages && (
            <Button variant="outline" size="sm" asChild>
              <Link href={reportUrl({ query: report.query, page: report.page + 1 })}>Next</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ComplianceReportShell({ paramsPromise }: { paramsPromise: Promise<ReportParams> }) {
  return (
    <div className="min-h-full bg-background">
      <div className="border-b border-border bg-background/90 md:sticky md:top-0 md:z-10">
        <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">
              Compliance status
            </h1>
            <p className="mt-0.5 text-xs text-subtle">Inventory configuration compliance</p>
          </div>
          <Button variant="ghost" asChild>
            <Link href="/inventory/devices">Back to inventory</Link>
          </Button>
        </div>
      </div>
      <Suspense
        fallback={
          <p className="px-4 py-8 text-sm text-subtle md:px-8" role="status">
            Checking compliance status…
          </p>
        }
      >
        <ReportContent paramsPromise={paramsPromise} />
      </Suspense>
    </div>
  )
}
