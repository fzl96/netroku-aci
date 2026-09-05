import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IconChevronLeft } from '@tabler/icons-react'
import {
  buildInterfaceDetailUrl,
  HISTORY_ROW_LIMIT,
  type InterfaceDetailParams,
} from '@/lib/interface-health/detail-params'
import { ERROR_TREND_RANGES, type ErrorTrendPoint } from '@/lib/interface-health/error-trend'
import { fmtDate, fmtRelative } from '@/lib/interface-health/format'
import {
  getInterfaceErrorSamples,
  getInterfaceStatusDetails,
  InterfaceReadError,
} from '@/lib/interface-health/query'
import type { InterfaceStatusDetails } from '@/lib/interface-health/state-changes'
import { DENSE_TABLE_HEAD_CLS } from '@/lib/ui-classes'
import { ERROR_TREND_CAPTION, InterfaceErrorTrendChart } from './interface-error-trend-chart'
import { InterfaceRegionError } from './interface-region-error'
import { OperStBadge } from './interface-status-badge'

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

function StatusHistory({
  details,
  params,
}: {
  details: InterfaceStatusDetails
  params: InterfaceDetailParams
}) {
  const all = details.samples
  const filtered = params.changesOnly ? all.filter((s) => s.isStateChange) : all
  // Newest first: an investigation starts from what just happened.
  const ordered = [...filtered].reverse()
  const shown = ordered.slice(0, HISTORY_ROW_LIMIT)
  const truncated = ordered.length - shown.length

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="font-serif text-sm font-semibold text-foreground">
            {params.changesOnly ? 'State changes' : 'Samples'}
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            {ordered.length === 0
              ? params.changesOnly
                ? 'This port held its state for the whole range.'
                : 'No samples stored for this range.'
              : params.range === 'all'
                ? `${ordered.length} across all recorded history`
                : `${ordered.length} in the last ${params.range}`}
          </p>
        </div>
        <Segmented>
          <SegmentLink
            href={buildInterfaceDetailUrl(details.id, { ...params, changesOnly: true })}
            active={params.changesOnly}
          >
            State changes
          </SegmentLink>
          <SegmentLink
            href={buildInterfaceDetailUrl(details.id, { ...params, changesOnly: false })}
            active={!params.changesOnly}
          >
            Every sample
          </SegmentLink>
        </Segmented>
      </div>

      {ordered.length === 0 ? (
        <p className="px-4 py-14 text-center text-sm text-muted-foreground">
          {params.changesOnly
            ? 'Nothing changed here. Switch to every sample to see the raw polls.'
            : 'Nothing has been sampled in this range. Try a wider range.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th className={DENSE_TABLE_HEAD_CLS}>Sampled</th>
                <th className={DENSE_TABLE_HEAD_CLS}>Admin</th>
                <th className={DENSE_TABLE_HEAD_CLS}>Oper</th>
                <th className={DENSE_TABLE_HEAD_CLS}>Speed</th>
                <th className={DENSE_TABLE_HEAD_CLS}>Event</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr
                  key={s.id}
                  className={[
                    'border-b border-border-faint last:border-0',
                    s.isStateChange ? 'bg-amber-500/5 dark:bg-amber-500/10' : '',
                  ].join(' ')}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground tabular-nums">
                    {fmtDate(s.sampledAt)}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.adminSt || '—'}</td>
                  <td className="px-4 py-2.5">
                    <OperStBadge st={s.operSt} adminSt={s.adminSt} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">
                    {s.operSpeed || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {s.isStateChange ? (
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        State change
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {truncated > 0 && (
        <p className="border-t border-border px-4 py-3 text-xs text-subtle">
          Showing the {HISTORY_ROW_LIMIT} most recent of {ordered.length}. Pick a shorter range to
          see the rest.
        </p>
      )}
    </section>
  )
}

export async function InterfaceDetailShell({
  idPromise,
  paramsPromise,
}: {
  idPromise: Promise<string>
  paramsPromise: Promise<InterfaceDetailParams>
}) {
  const [id, params] = await Promise.all([idPromise, paramsPromise])

  let details: InterfaceStatusDetails | null
  let samples: ErrorTrendPoint[]
  try {
    ;[details, samples] = await Promise.all([
      getInterfaceStatusDetails(id, params.range),
      getInterfaceErrorSamples(id, params.range),
    ])
  } catch (error) {
    if (!(error instanceof InterfaceReadError)) throw error
    console.error('[interface-health] failed to load interface detail', error)
    return (
      <div className="px-4 py-6 md:px-8">
        <InterfaceRegionError region="results" />
      </div>
    )
  }
  if (!details) notFound()

  return (
    <div className="min-h-full bg-background">
      <header className="z-10 border-b border-border bg-background/90 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col gap-3 px-4 py-3 md:h-auto md:px-8 md:py-4">
          <Link
            href={params.backUrl || '/interface-health'}
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <IconChevronLeft size={13} stroke={1.75} />
            Interfaces
          </Link>
          <div className="flex flex-col justify-between gap-2 md:flex-row md:items-center">
            <div className="min-w-0">
              <h1 className="font-serif text-[18px] font-semibold text-foreground">
                Node {details.node || '—'} /{' '}
                <span className="font-mono">{details.ifName || '—'}</span>
              </h1>
              <p className="mt-0.5 truncate text-xs text-subtle">
                {details.description || 'No description'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <OperStBadge st={details.operSt} adminSt={details.adminSt} />
              <span>{details.operSpeed || 'Speed unknown'}</span>
              <span>Link changed {fmtRelative(details.lastLinkStChg)}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="space-y-4 px-4 py-4 md:px-8 md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented>
            {ERROR_TREND_RANGES.map((r) => (
              <SegmentLink
                key={r.value}
                href={buildInterfaceDetailUrl(details.id, { ...params, range: r.value })}
                active={params.range === r.value}
              >
                {r.label}
              </SegmentLink>
            ))}
          </Segmented>
          <p className="text-xs text-subtle">
            Sampled {fmtRelative(details.lastSeenAt)} · first seen {fmtDate(details.firstSeenAt)}
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-serif text-sm font-semibold text-foreground">Errors over time</h2>
          <p className="mt-0.5 mb-3 max-w-[68ch] text-xs leading-relaxed text-muted-foreground">
            {ERROR_TREND_CAPTION}
          </p>
          {samples.length === 0 ? (
            <p className="py-20 text-center text-sm text-muted-foreground">
              No samples in this range. Try a wider range.
            </p>
          ) : (
            <div className="h-[360px]">
              <InterfaceErrorTrendChart points={samples} />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="font-serif text-sm font-semibold text-foreground">Port</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Fact label="Admin state" value={details.adminSt || '—'} />
            <Fact
              label="Oper state"
              value={<OperStBadge st={details.operSt} adminSt={details.adminSt} />}
            />
            <Fact label="Speed" value={details.operSpeed || '—'} />
            <Fact label="Usage" value={details.usage || '—'} />
            <Fact
              label="Last link change"
              value={
                <>
                  {fmtDate(details.lastLinkStChg)}{' '}
                  <span className="text-xs text-subtle">
                    ({fmtRelative(details.lastLinkStChg)})
                  </span>
                </>
              }
            />
            <Fact label="First seen" value={fmtDate(details.firstSeenAt)} />
            <Fact label="Last seen" value={fmtDate(details.lastSeenAt)} />
          </dl>
          <div className="mt-4 border-t border-border pt-3">
            <dt className="text-[11px] text-subtle">Distinguished name</dt>
            <dd className="mt-1 font-mono text-xs break-all text-muted-foreground">{details.dn}</dd>
          </div>
        </section>

        <StatusHistory details={details} params={params} />
      </main>
    </div>
  )
}
