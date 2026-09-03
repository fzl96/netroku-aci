# Per-interface Error-Trend Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking an interface row opens a right-side drawer showing a time-series line chart of that interface's six error/discard deltas, with a 24h/7d/30d/All range selector.

**Architecture:** Pure helpers (range→cutoff math, BigInt→number serialization, chart series config) live in a testable module. A server action lazily fetches one interface's error samples on drawer open. A client drawer component renders a shadcn/Recharts `LineChart` with a custom clickable legend that toggles series. `InterfaceHealthClient` owns the selected-row state and renders the drawer.

**Tech Stack:** Next.js (App Router) server actions, Prisma, React client components, shadcn `sheet`/`chart`/`toggle-group`, Recharts 3.8.0, `bun:test`.

---

## File Structure

- **Create** `src/app/(app)/interface-health/error-trend.ts` — pure helpers + types + series/range config (no React, no Prisma; fully unit-testable).
- **Create** `src/app/(app)/interface-health/error-trend.test.ts` — `bun:test` for the pure helpers.
- **Create** `src/actions/interface-samples.ts` — `getInterfaceErrorSamples` server action (auth + Prisma, delegates transforms to `error-trend.ts`).
- **Create** `src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx` — client drawer: Sheet + range toggle + chart + custom legend.
- **Modify** `src/app/(app)/interface-health/InterfaceHealthClient.tsx` — selected-row state, row `onClick`, render the drawer.

The page server component (`page.tsx`) is **not** touched — it already passes `id`, `node`, `ifName`, `description`, and `operSt` into each row, which is all the drawer needs to identify the interface. History is fetched lazily by the action.

---

## Task 1: Pure helpers — range math, serialization, series config

**Files:**

- Create: `src/app/(app)/interface-health/error-trend.ts`
- Test: `src/app/(app)/interface-health/error-trend.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/interface-health/error-trend.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { rangeToCutoff, serializeErrorSamples } from './error-trend'

describe('rangeToCutoff', () => {
  const now = new Date('2026-06-13T12:00:00.000Z')

  it('returns null for "all"', () => {
    expect(rangeToCutoff('all', now)).toBeNull()
  })

  it('subtracts 24 hours for "24h"', () => {
    expect(rangeToCutoff('24h', now)?.toISOString()).toBe('2026-06-12T12:00:00.000Z')
  })

  it('subtracts 7 days for "7d"', () => {
    expect(rangeToCutoff('7d', now)?.toISOString()).toBe('2026-06-06T12:00:00.000Z')
  })

  it('subtracts 30 days for "30d"', () => {
    expect(rangeToCutoff('30d', now)?.toISOString()).toBe('2026-05-14T12:00:00.000Z')
  })
})

describe('serializeErrorSamples', () => {
  it('converts BigInt deltas to numbers and dates to ISO strings', () => {
    const out = serializeErrorSamples([
      {
        sampledAt: new Date('2026-06-13T00:00:00.000Z'),
        dRxErrors: 5n,
        dTxErrors: 0n,
        dRxCrcErrors: 2n,
        dRxAlignErrors: 0n,
        dRxDiscards: 7n,
        dTxDiscards: 1n,
      },
    ])
    expect(out).toEqual([
      {
        sampledAt: '2026-06-13T00:00:00.000Z',
        dRxErrors: 5,
        dTxErrors: 0,
        dRxCrcErrors: 2,
        dRxAlignErrors: 0,
        dRxDiscards: 7,
        dTxDiscards: 1,
      },
    ])
  })

  it('preserves nulls (first sample / counter reset) instead of coercing to 0', () => {
    const out = serializeErrorSamples([
      {
        sampledAt: new Date('2026-06-13T00:00:00.000Z'),
        dRxErrors: null,
        dTxErrors: null,
        dRxCrcErrors: null,
        dRxAlignErrors: null,
        dRxDiscards: null,
        dTxDiscards: null,
      },
    ])
    expect(out[0].dRxErrors).toBeNull()
    expect(out[0].dTxDiscards).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "src/app/(app)/interface-health/error-trend.test.ts"`
Expected: FAIL — `Cannot find module './error-trend'` (or "rangeToCutoff is not a function").

- [ ] **Step 3: Write minimal implementation**

Create `src/app/(app)/interface-health/error-trend.ts`:

```ts
// Pure helpers + config for the per-interface error-trend drawer.
// No React, no Prisma — keep this unit-testable.

export type ErrorTrendRange = '24h' | '7d' | '30d' | 'all'

export const DEFAULT_ERROR_TREND_RANGE: ErrorTrendRange = '7d'

export const ERROR_TREND_RANGES: { label: string; value: ErrorTrendRange }[] = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
]

// One plotted line per stored error/discard delta. `color` resolves via shadcn's
// ChartContainer, which injects `--color-<key>` CSS vars from the ChartConfig.
export const ERROR_TREND_SERIES = [
  { key: 'dRxErrors', label: 'Rx err', color: 'var(--chart-1)' },
  { key: 'dTxErrors', label: 'Tx err', color: 'var(--chart-2)' },
  { key: 'dRxCrcErrors', label: 'CRC', color: 'var(--chart-3)' },
  { key: 'dRxAlignErrors', label: 'Align', color: 'var(--chart-4)' },
  { key: 'dRxDiscards', label: 'Rx disc', color: 'var(--chart-5)' },
  { key: 'dTxDiscards', label: 'Tx disc', color: 'var(--muted-foreground)' },
] as const

export type ErrorTrendKey = (typeof ERROR_TREND_SERIES)[number]['key']

export interface ErrorTrendPoint {
  sampledAt: string // ISO 8601
  dRxErrors: number | null
  dTxErrors: number | null
  dRxCrcErrors: number | null
  dRxAlignErrors: number | null
  dRxDiscards: number | null
  dTxDiscards: number | null
}

// Shape returned by the Prisma select in the server action.
export interface RawErrorSample {
  sampledAt: Date
  dRxErrors: bigint | null
  dTxErrors: bigint | null
  dRxCrcErrors: bigint | null
  dRxAlignErrors: bigint | null
  dRxDiscards: bigint | null
  dTxDiscards: bigint | null
}

const RANGE_MS: Record<Exclude<ErrorTrendRange, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
}

// Earliest sampledAt to include for a range, or null to include all history.
export function rangeToCutoff(range: ErrorTrendRange, now: Date): Date | null {
  if (range === 'all') return null
  return new Date(now.getTime() - RANGE_MS[range])
}

// Make Prisma rows safe to pass from a Server Action to a Client Component:
// BigInt -> number (error deltas are small), Date -> ISO string. Nulls preserved.
export function serializeErrorSamples(rows: RawErrorSample[]): ErrorTrendPoint[] {
  const toNum = (v: bigint | null) => (v === null ? null : Number(v))
  return rows.map((r) => ({
    sampledAt: r.sampledAt.toISOString(),
    dRxErrors: toNum(r.dRxErrors),
    dTxErrors: toNum(r.dTxErrors),
    dRxCrcErrors: toNum(r.dRxCrcErrors),
    dRxAlignErrors: toNum(r.dRxAlignErrors),
    dRxDiscards: toNum(r.dRxDiscards),
    dTxDiscards: toNum(r.dTxDiscards),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "src/app/(app)/interface-health/error-trend.test.ts"`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/interface-health/error-trend.ts" "src/app/(app)/interface-health/error-trend.test.ts"
git commit -m "feat: add error-trend helpers for interface drawer"
```

---

## Task 2: Server action — fetch one interface's error samples

**Files:**

- Create: `src/actions/interface-samples.ts`

This action does I/O (auth + Prisma) so it is verified by typecheck + the manual UI check in Task 4, mirroring the existing convention (`apic-hosts.ts` actions are not unit-tested; only pure helpers like those in `cron-resync.ts` are).

- [ ] **Step 1: Write the server action**

Create `src/actions/interface-samples.ts`:

```ts
'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  rangeToCutoff,
  serializeErrorSamples,
  type ErrorTrendPoint,
  type ErrorTrendRange,
} from '@/app/(app)/interface-health/error-trend'

// Lazily fetch one interface's error/discard deltas over a time range,
// ordered oldest -> newest for charting. Uses @@index([interfaceId, sampledAt]).
export async function getInterfaceErrorSamples(
  interfaceId: string,
  range: ErrorTrendRange,
): Promise<ErrorTrendPoint[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) throw new Error('Unauthorized')

  const cutoff = rangeToCutoff(range, new Date())

  const rows = await prisma.interfaceSample.findMany({
    where: {
      interfaceId,
      ...(cutoff ? { sampledAt: { gte: cutoff } } : {}),
    },
    orderBy: { sampledAt: 'asc' },
    select: {
      sampledAt: true,
      dRxErrors: true,
      dTxErrors: true,
      dRxCrcErrors: true,
      dRxAlignErrors: true,
      dRxDiscards: true,
      dTxDiscards: true,
    },
  })

  return serializeErrorSamples(rows)
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors (the action's return type matches `ErrorTrendPoint[]`; the Prisma `select` shape matches `RawErrorSample`).

- [ ] **Step 3: Commit**

```bash
git add src/actions/interface-samples.ts
git commit -m "feat: add getInterfaceErrorSamples server action"
```

---

## Task 3: Drawer component — Sheet + range toggle + chart + clickable legend

**Files:**

- Create: `src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx`

- [ ] **Step 1: Write the drawer component**

Create `src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx`:

```tsx
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

  // Fetch whenever the drawer opens for a new interface or the range changes.
  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setData(null)
    getInterfaceErrorSamples(selected.id, range)
      .then((rows) => {
        if (!cancelled) setData(rows)
      })
      .catch(() => {
        if (!cancelled) setData([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected, range])

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
      <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-xl">
        <SheetHeader>
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
          ) : isEmpty ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No samples in this range
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-full w-full">
              <LineChart data={data ?? []} margin={{ left: 4, right: 8, top: 8 }}>
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
                <ChartTooltip content={<ChartTooltipContent />} />
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
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx"
git commit -m "feat: add interface error-trend drawer component"
```

---

## Task 4: Wire the drawer into the table

**Files:**

- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

- [ ] **Step 1: Add imports**

In `src/app/(app)/interface-health/InterfaceHealthClient.tsx`, add after the `ApicCredentialDialog` import (around line 31):

```tsx
import {
  InterfaceErrorTrendDrawer,
  type SelectedInterface,
} from './InterfaceErrorTrendDrawer'
```

- [ ] **Step 2: Add selected-row state**

Inside the `InterfaceHealthClient` component body, just after `const router = useRouter()` (line 160), add:

```tsx
  const [selected, setSelected] = useState<SelectedInterface | null>(null)
```

(`useState` is already imported on line 3.)

- [ ] **Step 3: Make rows clickable**

In the `rows.map(...)` body, change the opening `<tr>` (lines 547-551) so the row is clickable and shows a pointer cursor. Replace:

```tsx
                          <tr
                            key={r.id}
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                            style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                          >
```

with:

```tsx
                          <tr
                            key={r.id}
                            onClick={() =>
                              setSelected({
                                id: r.id,
                                node: r.node,
                                ifName: r.ifName,
                                description: r.description,
                                operSt: r.operSt,
                              })
                            }
                            className="group cursor-pointer border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                            style={{ animationDelay: `${Math.min(i * 12, 200)}ms` }}
                          >
```

- [ ] **Step 4: Render the drawer**

Just before the closing `</div>` that wraps the component's return (immediately after the `<ApicCredentialDialog ... />` block at lines 663-669), add:

```tsx
      <InterfaceErrorTrendDrawer selected={selected} onClose={() => setSelected(null)} />
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Run the dev server: `bun run dev`
Then in the browser:

1. Open the Interfaces page and select an APIC host that has synced data.
2. Click any interface row → the right-side drawer opens with the node/ifName title.
3. Confirm the chart renders the error/discard deltas over time, with the 7d range selected by default.
4. Click a legend item (e.g. "Rx disc") → that line hides; click again → it returns.
5. Switch the range toggle to 24h / 30d / All → the chart refetches and updates.
6. For an interface with only one sample (all deltas null), confirm "No samples in this range" shows.
7. Close the drawer (Esc or the X) → returns to the table.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/interface-health/InterfaceHealthClient.tsx"
git commit -m "feat: open error-trend drawer on interface row click"
```

---

## Self-Review Notes

- **Spec coverage:** errors-only ✓ (Task 1 series, no throughput); all six deltas ✓ (`ERROR_TREND_SERIES`); raw delta vs real time ✓ (`XAxis dataKey="sampledAt"`, no normalization); lazy fetch via server action ✓ (Task 2, fired in Task 3 `useEffect`); range selector default 7d ✓ (`DEFAULT_ERROR_TREND_RANGE`); right-side Sheet ✓; null = line break ✓ (`connectNulls={false}`); clickable legend toggle ✓ (Task 3 custom legend + `hide`); loading + empty states ✓.
- **Naming consistency:** `getInterfaceErrorSamples`, `ErrorTrendPoint`, `ErrorTrendRange`, `ERROR_TREND_SERIES`, `serializeErrorSamples`, `rangeToCutoff`, `SelectedInterface`, `InterfaceErrorTrendDrawer` used identically across all tasks.
- **No placeholders:** every step contains full code or an exact command.

```

```
