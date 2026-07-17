'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  getInterfaceErrorSamples,
  getInterfaceStatusDetails,
} from '@/actions/interface-samples'
import { OperStBadge } from './InterfaceHealthClient'
import { type InterfaceStatusDetails } from './state-changes'
import {
  DEFAULT_ERROR_TREND_RANGE,
  ERROR_TREND_RANGES,
  ERROR_TREND_SERIES,
  findGapSegments,
  findResetTimestamps,
  insertGapBreaks,
  type ErrorTrendPoint,
  type ErrorTrendRange,
} from './error-trend'
import {
  makeDrawerRequestKey,
  resolveDrawerRequest,
  type DrawerRequestResult,
} from './drawer-request-state'

export interface SelectedInterface {
  id: string
  node: string
  ifName: string
  description: string
  operSt: string
}

const chartConfig: ChartConfig = Object.fromEntries(
  ERROR_TREND_SERIES.map((s) => [s.key, { label: s.label, color: s.color }]),
)

const DEFAULT_VISIBLE_KEY = 'dRxCrcErrors'
const defaultHidden = () =>
  new Set(ERROR_TREND_SERIES.map((s) => s.key).filter((k) => k !== DEFAULT_VISIBLE_KEY))

function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function fmtRelative(date: string | null): string {
  if (!date) return 'never'
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}

export function InterfaceErrorTrendDrawer({
  selected,
  onClose,
}: {
  selected: SelectedInterface | null
  onClose: () => void
}) {
  const [drawerMode, setDrawerMode] = useState<'errors' | 'status'>('errors')
  const [range, setRange] = useState<ErrorTrendRange>(DEFAULT_ERROR_TREND_RANGE)

  const [errorResult, setErrorResult] = useState<DrawerRequestResult<ErrorTrendPoint[]> | null>(null)
  const [statusResult, setStatusResult] = useState<DrawerRequestResult<InterfaceStatusDetails> | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(defaultHidden)
  const [onlyChanges, setOnlyChanges] = useState(false)

  const selectedId = selected?.id ?? null
  const errorRequestKey = selectedId
    ? makeDrawerRequestKey('errors', selectedId, range)
    : null
  const statusRequestKey = selectedId
    ? makeDrawerRequestKey('status', selectedId, range)
    : null
  const {
    data: errorData,
    loading: errorLoading,
    failed: errorFailed,
  } = resolveDrawerRequest(errorRequestKey, errorResult)
  const {
    data: statusData,
    loading: statusLoading,
    failed: statusFailed,
  } = resolveDrawerRequest(statusRequestKey, statusResult)

  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null)

  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId)
    if (selectedId) {
      setHidden(defaultHidden())
    }
  }

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false

    if (drawerMode === 'errors') {
      const requestKey = makeDrawerRequestKey('errors', selectedId, range)
      getInterfaceErrorSamples(selectedId, range)
        .then((rows) => {
          if (!cancelled) {
            setErrorResult({ key: requestKey, data: rows, failed: false })
          }
        })
        .catch((err) => {
          console.error(err)
          if (!cancelled) {
            setErrorResult({ key: requestKey, data: null, failed: true })
          }
        })
    } else {
      const requestKey = makeDrawerRequestKey('status', selectedId, range)
      getInterfaceStatusDetails(selectedId, range)
        .then((data) => {
          if (!cancelled) {
            setStatusResult({ key: requestKey, data, failed: false })
          }
        })
        .catch((err) => {
          console.error(err)
          if (!cancelled) {
            setStatusResult({ key: requestKey, data: null, failed: true })
          }
        })
    }

    return () => {
      cancelled = true
    }
  }, [selectedId, range, drawerMode])

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const isErrorsEmpty = !errorData || errorData.length === 0

  const resetTimestamps = useMemo(() => (errorData ? findResetTimestamps(errorData) : []), [errorData])
  const gaps = useMemo(() => (errorData ? findGapSegments(errorData) : []), [errorData])
  const displayData = useMemo(
    () => (errorData ? insertGapBreaks(errorData, gaps) : []),
    [errorData, gaps],
  )

  const filteredStatusSamples = useMemo(() => {
    if (!statusData?.samples) return []
    if (!onlyChanges) return statusData.samples
    return statusData.samples.filter((s) => s.isStateChange)
  }, [statusData, onlyChanges])

  return (
    <Sheet
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 p-6 data-[side=right]:sm:max-w-3xl overflow-y-auto">
        <SheetHeader className="p-0 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <SheetTitle className="text-base font-semibold">
                Node {selected?.node || '—'} /{' '}
                <span className="font-mono">{selected?.ifName}</span>
              </SheetTitle>
              <SheetDescription className="mt-0.5 truncate text-xs">
                {selected?.description || 'No description'}
              </SheetDescription>
            </div>

            {/* Drawer View Mode Switcher */}
            <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
              {(['errors', 'status'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={drawerMode === mode}
                  onClick={() => setDrawerMode(mode)}
                  className={[
                    'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                    drawerMode === mode
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  ].join(' ')}
                >
                  {mode === 'errors' ? 'Errors View' : 'Status View'}
                </button>
              ))}
            </div>
          </div>
        </SheetHeader>

        {/* Range Selector */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(v) => {
              if (v) setRange(v as ErrorTrendRange)
            }}
            className="justify-start"
          >
            {ERROR_TREND_RANGES.map((r) => (
              <ToggleGroupItem key={r.value} value={r.value} className="text-xs">
                {r.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {drawerMode === 'errors' ? (
          <>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each bar is the number of new errors counted since the previous sample —
              a per-interval change, not a running total. Taller bars mean more errors
              in that interval; no bar means none. Click a label below to show or hide a series.
            </p>

            {/* Clickable legend */}
            <div className="flex flex-wrap gap-2">
              {ERROR_TREND_SERIES.map((s) => {
                const off = hidden.has(s.key)
                return (
                  <button
                    key={s.key}
                    type="button"
                    aria-pressed={!off}
                    onClick={() => toggleSeries(s.key)}
                    className={[
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      off
                        ? 'border-border bg-transparent text-muted-foreground hover:text-foreground'
                        : 'border-transparent bg-muted text-foreground shadow-sm',
                    ].join(' ')}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={
                        off
                          ? { boxShadow: `inset 0 0 0 1.5px var(--color-${s.key})` }
                          : { background: `var(--color-${s.key})` }
                      }
                    />
                    {s.label}
                  </button>
                )
              })}
            </div>

            {(resetTimestamps.length > 0 || gaps.length > 0) && (
              <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                {resetTimestamps.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-0 border-l border-dashed border-muted-foreground/60" />
                    Counter reset
                  </span>
                )}
                {gaps.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-sm bg-muted-foreground/10" />
                    No data (missing samples)
                  </span>
                )}
              </div>
            )}

            <div className="min-h-[300px] flex-1">
              {errorLoading ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : errorFailed ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Couldn&apos;t load samples
                </div>
              ) : isErrorsEmpty ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No samples in this range
                </div>
              ) : (
                <ChartContainer config={chartConfig} className="h-full w-full">
                  <BarChart data={displayData} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                    <CartesianGrid vertical={false} />
                    {gaps.map((g) => (
                      <ReferenceArea
                        key={`gap-${g.mid}`}
                        x1={g.x1}
                        x2={g.x2}
                        fill="var(--muted-foreground)"
                        fillOpacity={0.08}
                        ifOverflow="extendDomain"
                      />
                    ))}
                    {resetTimestamps.map((ts) => (
                      <ReferenceLine
                        key={`reset-${ts}`}
                        x={ts}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="3 3"
                        strokeOpacity={0.5}
                      />
                    ))}
                    <XAxis
                      dataKey="sampledAt"
                      tickLine={false}
                      axisLine={false}
                      minTickGap={32}
                      tickFormatter={(v) =>
                        new Date(v).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                        })
                      }
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={48} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          labelFormatter={(_, payload) =>
                            payload?.[0]?.payload?.sampledAt
                              ? new Date(payload[0].payload.sampledAt).toLocaleString()
                              : ''
                          }
                        />
                      }
                    />
                    {ERROR_TREND_SERIES.map((s) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        fill={`var(--color-${s.key})`}
                        radius={2}
                        hide={hidden.has(s.key)}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          </>
        ) : (
          /* Status View */
          <div className="flex flex-col gap-5">
            {statusLoading ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Loading status details…
              </div>
            ) : statusFailed || !statusData ? (
              <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Couldn&apos;t load status details
              </div>
            ) : (
              <>
                {/* Status Summary Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin State</div>
                    <div className="mt-1 font-mono text-sm font-medium">{statusData.adminSt || '—'}</div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Oper State</div>
                    <div className="mt-1">
                      <OperStBadge st={statusData.operSt} adminSt={statusData.adminSt} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/40 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Speed</div>
                    <div className="mt-1 text-sm font-medium">{statusData.operSpeed || '—'}</div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Link Change</div>
                    <div className="mt-1 text-sm font-medium">
                      {fmtDate(statusData.lastLinkStChg)}{' '}
                      <span className="text-xs text-muted-foreground">({fmtRelative(statusData.lastLinkStChg)})</span>
                    </div>
                  </div>
                  <div className="col-span-2 rounded-lg border border-border bg-muted/40 p-3 sm:col-span-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Distinguished Name (DN)</div>
                    <div className="mt-1 font-mono text-xs break-all text-muted-foreground">{statusData.dn}</div>
                  </div>
                </div>

                {/* History Header & Filter Toggle */}
                <div className="flex items-center justify-between gap-2 pt-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                    State Transition History ({filteredStatusSamples.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setOnlyChanges((v) => !v)}
                    className={[
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      onlyChanges
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                    ].join(' ')}
                  >
                    {onlyChanges ? 'Showing State Changes Only' : 'Show State Changes Only'}
                  </button>
                </div>

                {/* History Table */}
                <div className="max-h-[320px] overflow-y-auto rounded-lg border border-border">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/90 backdrop-blur border-b border-border text-muted-foreground font-medium">
                      <tr>
                        <th className="px-3 py-2">Timestamp</th>
                        <th className="px-3 py-2">Admin</th>
                        <th className="px-3 py-2">Oper</th>
                        <th className="px-3 py-2">Speed</th>
                        <th className="px-3 py-2 text-right">Event</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {filteredStatusSamples.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                            {onlyChanges ? 'No state changes recorded in this range.' : 'No resync samples in this range.'}
                          </td>
                        </tr>
                      ) : (
                        filteredStatusSamples.map((s) => (
                          <tr
                            key={s.id}
                            className={[
                              'transition-colors',
                              s.isStateChange ? 'bg-amber-500/5 dark:bg-amber-500/10 font-medium' : 'hover:bg-muted/50',
                            ].join(' ')}
                          >
                            <td className="px-3 py-2 tabular-nums text-muted-foreground">
                              {fmtDate(s.sampledAt)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{s.adminSt || '—'}</td>
                            <td className="px-3 py-2">
                              <OperStBadge st={s.operSt} adminSt={s.adminSt} />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{s.operSpeed || '—'}</td>
                            <td className="px-3 py-2 text-right">
                              {s.isStateChange ? (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                  State Change
                                </span>
                              ) : (
                                <span className="text-[10px] text-faint">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
