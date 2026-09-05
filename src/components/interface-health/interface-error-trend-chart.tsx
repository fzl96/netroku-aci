'use client'

import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ReferenceArea, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  ERROR_TREND_SERIES,
  findGapSegments,
  findResetTimestamps,
  insertGapBreaks,
  type ErrorTrendPoint,
} from '@/lib/interface-health/error-trend'

const chartConfig: ChartConfig = Object.fromEntries(
  ERROR_TREND_SERIES.map((s) => [s.key, { label: s.label, color: s.color }]),
)

// CRC is the counter that sends people here, so it is the one series drawn on
// arrival; the rest are a click away.
const DEFAULT_VISIBLE_KEY = 'dRxCrcErrors'

function defaultHidden(): Set<string> {
  return new Set(ERROR_TREND_SERIES.map((s) => s.key).filter((k) => k !== DEFAULT_VISIBLE_KEY))
}

/** The per-interface error-delta chart. Points are read on the server and
 *  handed over whole; only which series are drawn is client state. */
export function InterfaceErrorTrendChart({
  points,
  className = 'h-full w-full',
}: {
  points: ErrorTrendPoint[]
  className?: string
}) {
  const [hidden, setHidden] = useState<Set<string>>(defaultHidden)

  const resetTimestamps = useMemo(() => findResetTimestamps(points), [points])
  const gaps = useMemo(() => findGapSegments(points), [points])
  const displayData = useMemo(() => insertGapBreaks(points, gaps), [points, gaps])

  const toggleSeries = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="flex h-full flex-col gap-3">
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

      <div className="min-h-[260px] flex-1">
        <ChartContainer config={chartConfig} className={className}>
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
      </div>
    </div>
  )
}

export const ERROR_TREND_CAPTION =
  'Each bar counts the new errors recorded since the previous sample — a per-interval change, not a running total. Select a series to show or hide it.'
