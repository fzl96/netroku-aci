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
import { getInterfaceErrorSamples } from '@/actions/interface-samples'
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


export function InterfaceErrorTrendDrawer({
  selected,
  onClose,
}: {
  selected: SelectedInterface | null
  onClose: () => void
}) {
  const [range, setRange] = useState<ErrorTrendRange>(DEFAULT_ERROR_TREND_RANGE)
  const [data, setData] = useState<ErrorTrendPoint[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [error, setError] = useState(false)

  const selectedId = selected?.id ?? null
  const [prevSelectedId, setPrevSelectedId] = useState<string | null>(null)

  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId)
    if (selectedId) {
      setLoading(true)
      setData(null)
      setHidden(new Set())
      setError(false)
    }
  }

  // Fetch whenever the drawer opens for a new interface or the range changes.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    getInterfaceErrorSamples(selectedId, range)
      .then((rows) => {
        if (!cancelled) setData(rows)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) {
          setError(true)
          setData([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedId, range])

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const isEmpty = !data || data.length === 0

  // Resets are detected on the raw series; monitoring gaps get a synthetic null
  // filler inserted so the line breaks across them instead of bridging.
  const resetTimestamps = useMemo(() => (data ? findResetTimestamps(data) : []), [data])
  const gaps = useMemo(() => (data ? findGapSegments(data) : []), [data])
  const displayData = useMemo(
    () => (data ? insertGapBreaks(data, gaps) : []),
    [data, gaps],
  )

  return (
    <Sheet
      open={selected !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-4 p-6 data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="p-0">
          <SheetTitle>
            {selected?.node || '—'} /{' '}
            <span className="font-mono">{selected?.ifName}</span>
          </SheetTitle>
          <SheetDescription>
            {(selected?.description || 'No description') + ' · ' + (selected?.operSt || '—')}
          </SheetDescription>
        </SheetHeader>

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

        {/* Clickable legend — toggles each series on/off */}
        <div className="flex flex-wrap gap-3">
          {ERROR_TREND_SERIES.map((s) => {
            const off = hidden.has(s.key)
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleSeries(s.key)}
                className={[
                  'flex items-center gap-1.5 text-xs transition-opacity',
                  off ? 'opacity-40' : 'opacity-100',
                ].join(' ')}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: `var(--color-${s.key})` }}
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

        <div className="min-h-0 flex-1">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Couldn&apos;t load samples
            </div>
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No samples in this range
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <BarChart data={displayData} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} />
                {/* Monitoring gaps: shaded band between the last and first good sample. */}
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
                {/* Counter resets: dashed vertical rule at the reset timestamp. */}
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
      </SheetContent>
    </Sheet>
  )
}
