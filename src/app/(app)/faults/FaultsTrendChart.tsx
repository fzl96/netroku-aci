'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

export type TrendPoint = {
  sampledAt: string
  critical: number
  major: number
  minor: number
  warning: number
}

const SERIES = ['critical', 'major', 'minor', 'warning'] as const

const trendConfig: ChartConfig = {
  critical: { label: 'Critical', color: 'var(--chart-1)' },
  major: { label: 'Major', color: 'var(--chart-2)' },
  minor: { label: 'Minor', color: 'var(--chart-3)' },
  warning: { label: 'Warning', color: 'var(--chart-4)' },
}

export default function FaultsTrendChart({ trend }: { trend: TrendPoint[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint mb-3">
        Severity trend
      </h2>
      <ChartContainer config={trendConfig} className="h-44 w-full">
        <LineChart data={trend} margin={{ left: 4, right: 8, top: 8 }}>
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
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
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
          {SERIES.map((s) => (
            <Line
              key={s}
              type="monotone"
              dataKey={s}
              stroke={`var(--color-${s})`}
              dot={false}
              connectNulls={false}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  )
}
