'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { CrcTrendPoint } from '@/lib/interface-health/crc-trend'

const trendConfig: ChartConfig = {
  crcErrorsDelta: { label: 'CRC Errors Δ', color: 'var(--chart-3)' },
}

export function InterfaceCrcTrendChart({ trend }: { trend: CrcTrendPoint[] }) {
  const totalCrcInPeriod = trend.reduce((sum, item) => sum + item.crcErrorsDelta, 0)

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            7-Day CRC Error Delta Trend
          </h2>
          <p className="mt-0.5 text-xs text-subtle">
            Total CRC errors accumulated across affected ports in the last 7 days:{' '}
            <span className="text-danger font-semibold">{totalCrcInPeriod}</span>
          </p>
        </div>
      </div>

      {trend.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border/60 text-xs text-subtle">
          No CRC error deltas recorded in the last 7 days
        </div>
      ) : (
        <ChartContainer config={trendConfig} className="h-44 w-full">
          <LineChart data={trend} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.4} />
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
                  minute: '2-digit',
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
            <Line
              type="monotone"
              dataKey="crcErrorsDelta"
              stroke="var(--chart-3)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ChartContainer>
      )}
    </div>
  )
}
