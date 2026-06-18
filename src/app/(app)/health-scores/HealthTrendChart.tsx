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
  overall: number
  worstScore: number
}

const trendConfig: ChartConfig = {
  overall: { label: 'Overall', color: 'var(--chart-1)' },
  worstScore: { label: 'Worst', color: 'var(--chart-2)' },
}

export default function HealthTrendChart({ trend }: { trend: TrendPoint[] }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
      <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-faint mb-3">
        Overall trend
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
          <Line
            type="monotone"
            dataKey="overall"
            stroke="var(--color-overall)"
            dot={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="worstScore"
            stroke="var(--color-worstScore)"
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ChartContainer>
    </div>
  )
}
