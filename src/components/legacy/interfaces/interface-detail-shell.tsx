import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IconChevronLeft } from '@tabler/icons-react'
import { LEGACY_RANGES } from '@/lib/legacy/query'
import { normalizeLegacyInterfaceState } from '@/lib/legacy/interfaces/filters'
import {
  buildLegacyInterfaceDetailUrl,
  type LegacyInterfaceDetailParams,
} from '@/lib/legacy/interfaces/detail-params'
import {
  getLegacyInterfaceHistory,
  LegacyInterfaceReadError,
  type LegacyInterfaceHistory,
} from '@/lib/legacy/interfaces/query'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'
import { LegacyInterfaceRegionError } from './interface-region-error'
import { LegacyInterfaceTrendChart } from './interface-trend-chart'

const RANGE_SUMMARY: Record<(typeof LEGACY_RANGES)[number], string> = {
  '24h': 'in the last 24 hours',
  '7d': 'in the last 7 days',
  '30d': 'in the last 30 days',
  all: 'across all recorded history',
}

function exactCounter(value: string | null): string {
  if (value === null) return '—'
  try {
    return BigInt(value).toLocaleString()
  } catch {
    return value
  }
}

function timestamp(value: string): string {
  return new Date(value).toLocaleString()
}

function OperBadge({ state }: { state: string }) {
  if (normalizeLegacyInterfaceState(state) === 'down') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
        <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
        down
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
      <span className="size-1.5 shrink-0 rounded-full bg-success-dot" />
      up
    </span>
  )
}

function Segmented({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">{children}</div>
  )
}

function SegmentLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'true' : undefined}
      scroll={false}
      className={[
        'rounded-md px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      {children}
    </Link>
  )
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-subtle">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  )
}

const SAMPLE_COLUMNS = [
  'Collected',
  'Admin',
  'Oper',
  'Speed',
  'Input',
  'Δ input',
  'Output',
  'Δ output',
  'CRC',
  'Δ CRC',
]

function Samples({
  history,
  params,
}: {
  history: LegacyInterfaceHistory
  params: LegacyInterfaceDetailParams
}) {
  const pages = Math.max(1, Math.ceil(history.total / history.pageSize))
  const page = Math.min(history.page, pages)
  const pageUrl = (next: number) =>
    buildLegacyInterfaceDetailUrl(history.snapshot.id, { ...params, page: next })

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-serif text-sm font-semibold text-foreground">Samples</h2>
          <p className="mt-0.5 text-xs text-subtle">
            {history.total === 0
              ? 'Nothing collected in this range.'
              : `${history.total} collected ${RANGE_SUMMARY[history.range]}`}
          </p>
        </div>
        {pages > 1 && (
          <div className="flex items-center gap-2 text-xs text-subtle">
            {page > 1 ? (
              <Link
                href={pageUrl(page - 1)}
                scroll={false}
                className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-muted"
              >
                Previous
              </Link>
            ) : (
              <span className="rounded-md border border-border px-2 py-1 opacity-35">Previous</span>
            )}
            <span>
              {page} / {pages}
            </span>
            {page < pages ? (
              <Link
                href={pageUrl(page + 1)}
                scroll={false}
                className="rounded-md border border-border px-2 py-1 text-foreground transition-colors hover:bg-muted"
              >
                Next
              </Link>
            ) : (
              <span className="rounded-md border border-border px-2 py-1 opacity-35">Next</span>
            )}
          </div>
        )}
      </div>

      {history.samples.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-muted-foreground">
          Nothing has been sampled in this range. Try a wider range.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {SAMPLE_COLUMNS.map((label) => (
                  <th key={label} className={DENSE_TABLE_HEAD_CLS}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.samples.map((sample) => (
                <tr key={sample.id} className="border-b border-border/70 last:border-0">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {timestamp(sample.collectedAt)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{sample.adminSt || '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{sample.operSt || '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {sample.speed || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.inputErrors)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.dInputErrors)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.outputErrors)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.dOutputErrors)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.crcErrors)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-subtle">
                    {exactCounter(sample.dCrcErrors)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export async function LegacyInterfaceDetailShell({
  idPromise,
  paramsPromise,
}: {
  idPromise: Promise<string>
  paramsPromise: Promise<LegacyInterfaceDetailParams>
}) {
  const [id, params] = await Promise.all([idPromise, paramsPromise])

  let history: LegacyInterfaceHistory | null
  try {
    history = await getLegacyInterfaceHistory(id, { range: params.range, page: params.page })
  } catch (error) {
    if (!(error instanceof LegacyInterfaceReadError)) throw error
    console.error('[legacy-interfaces] failed to load interface detail', error)
    return (
      <div className="px-4 py-6 md:px-8">
        <LegacyInterfaceRegionError region="results" />
      </div>
    )
  }
  if (!history) notFound()

  const { snapshot } = history
  const address = snapshot.ipAddress
    ? `${snapshot.ipAddress}${snapshot.prefixLength === null ? '' : `/${snapshot.prefixLength}`}`
    : 'Not assigned'

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:px-8 md:py-4">
          <Link
            href={params.backUrl || '/legacy/interfaces'}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconChevronLeft size={13} stroke={1.75} />
            Interfaces
          </Link>
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div className="min-w-0">
              <h1 className="font-serif text-[18px] font-semibold text-foreground">
                {snapshot.device.hostname} / <span className="font-mono">{snapshot.ifName}</span>
              </h1>
              <p className="mt-0.5 truncate text-xs text-subtle">
                {snapshot.description || 'No description'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <OperBadge state={snapshot.operSt} />
              <span>{snapshot.speed || 'Speed unknown'}</span>
              <span>{snapshot.device.site}</span>
              {!snapshot.present && <span className="text-faint">No longer present</span>}
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented>
            {LEGACY_RANGES.map((range) => (
              <SegmentLink
                key={range}
                href={buildLegacyInterfaceDetailUrl(snapshot.id, {
                  ...params,
                  range,
                  page: 1,
                })}
                active={params.range === range}
              >
                {range}
              </SegmentLink>
            ))}
          </Segmented>
          <p className="text-xs text-subtle">
            Last collected {timestamp(snapshot.lastSeenAt)} · first seen{' '}
            {timestamp(snapshot.firstSeenAt)}
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-serif text-sm font-semibold text-foreground">Errors over time</h2>
          <p className="mt-0.5 mb-3 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
            Each point is the increase since the previous collection, so a flat line means the port
            counted no new errors. Gaps are collections where the device reset its counters.
          </p>
          <LegacyInterfaceTrendChart points={history.chart} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-serif text-sm font-semibold text-foreground">Port</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Fact label="Admin state" value={normalizeLegacyInterfaceState(snapshot.adminSt)} />
            <Fact label="Oper state" value={<OperBadge state={snapshot.operSt} />} />
            <Fact label="Speed" value={snapshot.speed || '—'} />
            <Fact label="MTU" value={snapshot.mtu === null ? '—' : snapshot.mtu} />
            <Fact label="Address" value={<span className="font-mono">{address}</span>} />
            <Fact label="Device" value={snapshot.device.hostname} />
            <Fact label="Site" value={snapshot.device.site} />
            <Fact
              label="Management IP"
              value={<span className="font-mono">{snapshot.device.managementIp}</span>}
            />
          </dl>
        </section>

        <Samples history={history} params={params} />
      </main>
    </div>
  )
}
