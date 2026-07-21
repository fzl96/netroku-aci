'use client'

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

export function LegacyHealthTrendChart({ points }: { points: Array<{ collectedAt: string; cpuPercent: number | null; memoryPercent: number | null; storagePercent: number | null; temperatureCelsius: number | null }> }) {
  if (points.length === 0) return <div className="grid h-48 place-items-center rounded-xl border border-dashed border-border text-xs text-subtle">No samples in this range</div>
  return (
    <div className="h-56 rounded-xl border border-border bg-card p-3">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 200 }}>
        <LineChart data={points} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="collectedAt" tickFormatter={value => new Date(value).toLocaleDateString()} tick={{ fontSize: 10 }} minTickGap={28} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip labelFormatter={value => new Date(String(value)).toLocaleString()} contentStyle={{ fontSize: 11, borderRadius: 10 }} />
          <Line type="monotone" dataKey="cpuPercent" name="CPU %" stroke="var(--color-primary)" dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="memoryPercent" name="Memory %" stroke="#7c6ee6" dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="storagePercent" name="Storage %" stroke="#d38c31" dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="temperatureCelsius" name="Temperature °C" stroke="#c65353" dot={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
