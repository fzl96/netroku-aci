'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { safeLegacyCounterNumber } from '@/lib/legacy-ui/interfaces'
import type { LegacyInterfaceSampleRow } from './LegacyInterfacesClient'

export function LegacyInterfaceTrendChart({ points }: { points: LegacyInterfaceSampleRow[] }) {
  const chartPoints = points.map(point => ({
    collectedAt: point.collectedAt,
    input: safeLegacyCounterNumber(point.dInputErrors),
    output: safeLegacyCounterNumber(point.dOutputErrors),
    crc: safeLegacyCounterNumber(point.dCrcErrors),
  }))

  if (chartPoints.length === 0) return <div className="grid h-48 place-items-center rounded-xl border border-dashed border-border text-xs text-subtle">No samples in this range</div>

  return <div className="h-56 rounded-xl border border-border bg-card p-3">
    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 200 }}>
      <LineChart data={chartPoints} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="collectedAt" tickFormatter={value => new Date(value).toLocaleDateString()} tick={{ fontSize: 10 }} minTickGap={28} />
        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
        <Tooltip labelFormatter={value => new Date(String(value)).toLocaleString()} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
        <Line type="monotone" dataKey="input" name="Input error delta" stroke="var(--color-primary)" dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="output" name="Output error delta" stroke="#7c6ee6" dot={false} connectNulls={false} />
        <Line type="monotone" dataKey="crc" name="CRC error delta" stroke="#c65353" dot={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
}
