'use client'

import { useEffect, useState } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
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
              <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} />
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
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    stroke={`var(--color-${s.key})`}
                    dot={false}
                    connectNulls={false}
                    hide={hidden.has(s.key)}
                  />
                ))}
              </LineChart>
            </ChartContainer>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
