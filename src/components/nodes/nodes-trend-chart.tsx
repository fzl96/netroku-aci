'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import type { NodeTrendPoint } from '@/lib/nodes/query'

const trendConfig: ChartConfig = {
  nodesOnline: { label: 'Nodes online', color: 'var(--chart-1)' },
  componentsFailed: { label: 'Failed components', color: 'var(--chart-2)' },
}

export default function NodesTrendChart({ trend }: { trend: NodeTrendPoint[] }) {
  return <div className="rounded-2xl border border-border bg-card p-4 shadow-sm"><h2 className="mb-3 text-[9px] font-semibold uppercase tracking-[0.12em] text-faint">Node trend</h2><ChartContainer config={trendConfig} className="h-44 w-full"><LineChart data={trend} margin={{ left: 4, right: 8, top: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="sampledAt" tickLine={false} axisLine={false} minTickGap={32} tickFormatter={value => new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit' })} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} /><ChartTooltip content={<ChartTooltipContent labelFormatter={(_, payload) => payload?.[0]?.payload?.sampledAt ? new Date(payload[0].payload.sampledAt).toLocaleString() : ''} />} /><Line type="monotone" dataKey="nodesOnline" stroke="var(--color-nodesOnline)" dot={false} connectNulls={false} /><Line type="monotone" dataKey="componentsFailed" stroke="var(--color-componentsFailed)" dot={false} connectNulls={false} /></LineChart></ChartContainer></div>
}
