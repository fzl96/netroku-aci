# Per-port Windowed CRC Total Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the interface-health Counting-CRC view, show each port's cumulative CRC-error increase over a selectable 7d/30d window (sum of positive deltas), default-sorted worst-first, instead of the latest-snapshot-only delta.

**Architecture:** A pure helper sums positive `dRxCrcErrors` per interface from the raw window samples already fetched for the trend chart, eliminating the separate `distinct` query. `page.tsx` attaches the per-port total to each row, drives the window off a new `window` search param, and default-sorts the CRC view by that total. The client swaps the CRC column for a windowed-total cell (with a latest-poll subtext) and adds a 7d/30d toggle, both scoped to the CRC view only.

**Tech Stack:** Next.js (App Router, RSC), Prisma, React, Tailwind, `bun test`.

## Global Constraints

- Counter values cross the server/client boundary as **decimal strings** (BigInt serialised), never as `number` or `bigint` — see `counter-mode.ts` and `page.tsx`.
- Unit tests use `bun:test` (`import { describe, expect, it } from 'bun:test'`).
- Window values are exactly the string literals `'7d'` (default) and `'30d'`.
- The "All" view (`view !== 'crc'`) must be visually and behaviourally unchanged.
- Header/empty-state copy uses "CRC increase in last 7d / 30d".

---

### Task 1: `sumCrcByInterface` helper

**Files:**

- Create: `src/app/(app)/interface-health/crc-window.ts`
- Test: `src/app/(app)/interface-health/crc-window.test.ts`

**Interfaces:**

- Produces: `sumCrcByInterface(samples: RawCrcInterfaceSample[]): Map<string, bigint>` where `RawCrcInterfaceSample = { interfaceId: string; dRxCrcErrors: bigint | null }`. Sums only strictly-positive deltas per `interfaceId`; skips `null` and `<= 0` (so a counter reset contributes 0). Interfaces with no positive samples are absent from the map.

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/interface-health/crc-window.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { sumCrcByInterface } from './crc-window'

describe('sumCrcByInterface', () => {
  it('sums positive dRxCrcErrors per interface', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: BigInt(5) },
      { interfaceId: 'a', dRxCrcErrors: BigInt(3) },
      { interfaceId: 'b', dRxCrcErrors: BigInt(12) },
    ])
    expect(totals.get('a')).toBe(BigInt(8))
    expect(totals.get('b')).toBe(BigInt(12))
  })

  it('skips null and non-positive deltas (reset contributes 0)', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: BigInt(4) },
      { interfaceId: 'a', dRxCrcErrors: null },
      { interfaceId: 'a', dRxCrcErrors: BigInt(-9) },
      { interfaceId: 'a', dRxCrcErrors: BigInt(0) },
    ])
    expect(totals.get('a')).toBe(BigInt(4))
  })

  it('omits interfaces with no positive samples', () => {
    const totals = sumCrcByInterface([
      { interfaceId: 'a', dRxCrcErrors: null },
    ])
    expect(totals.has('a')).toBe(false)
  })

  it('handles empty input', () => {
    expect(sumCrcByInterface([]).size).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/app/\(app\)/interface-health/crc-window.test.ts`
Expected: FAIL — cannot find module `./crc-window` / `sumCrcByInterface is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/app/(app)/interface-health/crc-window.ts`:

```ts
export interface RawCrcInterfaceSample {
  interfaceId: string
  dRxCrcErrors: bigint | null
}

/**
 * Sum strictly-positive CRC deltas per interface across the provided window
 * samples. Null / non-positive deltas (e.g. counter resets) contribute 0, so
 * an interface only appears in the map if it gained at least one CRC error.
 */
export function sumCrcByInterface(
  samples: RawCrcInterfaceSample[],
): Map<string, bigint> {
  const totals = new Map<string, bigint>()
  for (const s of samples) {
    if (s.dRxCrcErrors === null || s.dRxCrcErrors <= BigInt(0)) continue
    const current = totals.get(s.interfaceId) ?? BigInt(0)
    totals.set(s.interfaceId, current + s.dRxCrcErrors)
  }
  return totals
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/app/\(app\)/interface-health/crc-window.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/interface-health/crc-window.ts" "src/app/(app)/interface-health/crc-window.test.ts"
git commit -m "feat(interface-health): add sumCrcByInterface windowed CRC helper"
```

---

### Task 2: `sortByCrcWindowTotal` helper

**Files:**

- Modify: `src/app/(app)/interface-health/crc-window.ts`
- Test: `src/app/(app)/interface-health/crc-window.test.ts`

**Interfaces:**

- Consumes: the `Map<string, bigint>` produced by `sumCrcByInterface` (Task 1).
- Produces: `sortByCrcWindowTotal<T extends { id: string; node: string; ifName: string }>(rows: T[], totals: Map<string, bigint>, direction?: 'asc' | 'desc'): T[]`. Sorts by windowed total (default `'desc'`), missing id treated as 0, ties broken by natural node/ifName order. Pure — returns a new array.

- [ ] **Step 1: Write the failing test**

Append to `src/app/(app)/interface-health/crc-window.test.ts`:

```ts
import { sortByCrcWindowTotal } from './crc-window'

describe('sortByCrcWindowTotal', () => {
  const rows = [
    { id: 'a', node: '1805', ifName: 'eth1/3' },
    { id: 'b', node: '1806', ifName: 'eth1/26' },
    { id: 'c', node: '1806', ifName: 'eth1/27' },
  ]
  const totals = new Map<string, bigint>([
    ['a', BigInt(10)],
    ['c', BigInt(500)],
  ])

  it('sorts by windowed total descending by default, worst first', () => {
    const sorted = sortByCrcWindowTotal(rows, totals)
    expect(sorted.map(r => r.id)).toEqual(['c', 'a', 'b'])
  })

  it('sorts ascending when asked', () => {
    const sorted = sortByCrcWindowTotal(rows, totals, 'asc')
    expect(sorted.map(r => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('breaks ties by natural node/ifName order', () => {
    const tied = [
      { id: 'x', node: '1806', ifName: 'eth1/27' },
      { id: 'y', node: '1806', ifName: 'eth1/3' },
    ]
    const sorted = sortByCrcWindowTotal(tied, new Map())
    expect(sorted.map(r => r.id)).toEqual(['y', 'x'])
  })

  it('does not mutate the input array', () => {
    const input = [...rows]
    sortByCrcWindowTotal(input, totals)
    expect(input.map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/app/\(app\)/interface-health/crc-window.test.ts`
Expected: FAIL — `sortByCrcWindowTotal is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/app/(app)/interface-health/crc-window.ts`:

```ts
interface CrcSortableRow {
  id: string
  node: string
  ifName: string
}

const CRC_NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/**
 * Sort rows by their windowed CRC total (looked up in `totals`, missing = 0),
 * defaulting to descending so the worst offender is first. Ties fall back to
 * natural node/ifName ordering. Returns a new array.
 */
export function sortByCrcWindowTotal<T extends CrcSortableRow>(
  rows: T[],
  totals: Map<string, bigint>,
  direction: 'asc' | 'desc' = 'desc',
): T[] {
  return [...rows].sort((a, b) => {
    const aTotal = totals.get(a.id) ?? BigInt(0)
    const bTotal = totals.get(b.id) ?? BigInt(0)
    if (aTotal !== bTotal) {
      const order = aTotal > bTotal ? 1 : -1
      return direction === 'asc' ? order : -order
    }
    const nodeOrder = CRC_NATURAL_COLLATOR.compare(a.node, b.node)
    if (nodeOrder !== 0) return nodeOrder
    return CRC_NATURAL_COLLATOR.compare(a.ifName, b.ifName)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/app/\(app\)/interface-health/crc-window.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/interface-health/crc-window.ts" "src/app/(app)/interface-health/crc-window.test.ts"
git commit -m "feat(interface-health): add sortByCrcWindowTotal helper"
```

---

### Task 3: Add `TableSortKey` type for the CRC-total column

**Files:**

- Modify: `src/app/(app)/interface-health/sort.ts`

**Interfaces:**

- Produces: `export type TableSortKey = InterfaceSortKey | 'crcWindowTotal'`. `parseInterfaceSortParams` is unchanged and still returns `null` for `'crcWindowTotal'` (it is not in `INTERFACE_SORT_KEYS`), so sample-based sorting never receives it. `'crcWindowTotal'` is handled separately in `page.tsx` (Task 4).

Note: This task has no standalone runtime behavior to unit-test; it is a type-only addition consumed by Tasks 4 and 5. Verification is a typecheck.

- [ ] **Step 1: Add the type**

In `src/app/(app)/interface-health/sort.ts`, immediately after the `InterfaceSortDirection` / `InterfaceSortMode` type declarations (around line 15), add:

```ts
/** Column sort keys usable by the table header — includes the CRC-view-only
 *  windowed-total key, which is resolved in page.tsx rather than by
 *  sortInterfaceRows. */
export type TableSortKey = InterfaceSortKey | 'crcWindowTotal'
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: PASS (no new errors; `sort.ts` compiles with the added type).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/interface-health/sort.ts"
git commit -m "feat(interface-health): add TableSortKey for CRC windowed-total column"
```

---

### Task 4: Wire windowed totals + window param into `page.tsx`

**Files:**

- Modify: `src/app/(app)/interface-health/page.tsx`

**Interfaces:**

- Consumes: `sumCrcByInterface`, `sortByCrcWindowTotal` (Tasks 1–2); `aggregateCrcTrend` (existing).
- Produces: passes `window: '7d' | '30d'` to `InterfaceHealthClient`; each CRC-view row carries `crcWindowTotal: string | null`; CRC view is default-sorted by windowed total desc; `sortKey`/`sortDirection` props reflect `'crcWindowTotal'` when that sort is active.

This task has no unit test (RSC data-fetching against Prisma); it is verified by typecheck + build. Make all edits, then run Step 8.

- [ ] **Step 1: Import the helpers**

Replace the existing import (line 9):

```ts
import { aggregateCrcTrend, type CrcTrendPoint } from './crc-trend'
```

with:

```ts
import { aggregateCrcTrend, type CrcTrendPoint } from './crc-trend'
import { sumCrcByInterface, sortByCrcWindowTotal } from './crc-window'
```

- [ ] **Step 2: Accept the `window` search param**

In the `searchParams` type object (lines 28-38), add `window?: string` after `view?: string`:

```ts
    view?: string
    window?: string
```

And in the destructuring (lines 43-53), add `window: windowParam` after `view: viewParam`:

```ts
    view: viewParam,
    window: windowParam,
```

- [ ] **Step 3: Resolve the window**

Immediately after `const interfaceView = viewParam === 'crc' ? 'crc' : 'all'` (line 58), add:

```ts
  const crcWindow: '7d' | '30d' = windowParam === '30d' ? '30d' : '7d'
  const windowDays = crcWindow === '30d' ? 30 : 7
```

- [ ] **Step 4: Compute per-port totals and trend before the snapshot query**

Replace the window cutoff + `crcInterfaceIds` distinct block (lines 83-98):

```ts
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    let crcInterfaceIds: string[] = []
    if (interfaceView === 'crc') {
      const crcSamples = await prisma.interfaceSample.findMany({
        where: {
          apicHostId: apic,
          sampledAt: { gte: sevenDaysAgo },
          dRxCrcErrors: { gt: BigInt(0) },
        },
        select: { interfaceId: true },
        distinct: ['interfaceId'],
      })
      crcInterfaceIds = crcSamples.map(s => s.interfaceId)
    }
```

with:

```ts
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000)

    let crcInterfaceIds: string[] = []
    let crcTotals = new Map<string, bigint>()
    if (interfaceView === 'crc') {
      // One window fetch feeds both the aggregate trend chart and the
      // per-port windowed totals; the qualifying id set is just the map keys.
      const rawCrcSamples = await prisma.interfaceSample.findMany({
        where: {
          apicHostId: apic,
          sampledAt: { gte: windowStart },
          dRxCrcErrors: { gt: BigInt(0) },
        },
        select: { interfaceId: true, sampledAt: true, dRxCrcErrors: true },
        orderBy: { sampledAt: 'asc' },
      })
      crcTrend = aggregateCrcTrend(rawCrcSamples)
      crcTotals = sumCrcByInterface(rawCrcSamples)
      crcInterfaceIds = [...crcTotals.keys()]
    }
```

- [ ] **Step 5: Drop the now-duplicate `rawCrcSamples` query from `Promise.all`**

The `Promise.all` (lines 119-157) currently fetches four things: snapshots, count, nodes, and `rawCrcSamples`. Remove the fourth entry (the `prisma.interfaceSample.findMany` for `rawCrcSamples`, lines 145-156) and drop `rawCrcSamples` from the destructured array. The block becomes:

```ts
    const [snapshots, snapshotTotal, nodes] = await Promise.all([
      prisma.interfaceSnapshot.findMany({
        where,
        orderBy: [{ node: 'asc' }, { ifName: 'asc' }],
        include: {
          samples: {
            orderBy: { sampledAt: 'desc' },
            take: 1,
            select: {
              sampledAt: true,
              rxBytes: true, rxErrors: true,
              rxCrcErrors: true, rxAlignErrors: true,
              txBytes: true, txErrors: true,
              dRxBytes: true, dRxErrors: true, dRxDiscards: true,
              dRxCrcErrors: true, dRxAlignErrors: true,
              dTxBytes: true, dTxErrors: true, dTxDiscards: true,
            },
          },
        },
      }),
      prisma.interfaceSnapshot.count({ where }),
      prisma.interfaceSnapshot.findMany({
        where: { apicHostId: apic },
        select: { node: true },
        distinct: ['node'],
      }),
    ])
```

Then delete the now-redundant line `crcTrend = aggregateCrcTrend(rawCrcSamples)` that followed `total = snapshotTotal` (old line 160) — `crcTrend` is now assigned in Step 4. Keep `total = snapshotTotal`.

- [ ] **Step 6: Default-sort the CRC view by windowed total**

Replace the sort block (old lines 162-165):

```ts
    const sortedSnapshots = sortInterfaceRows(snapshots, interfaceSort ?? undefined)
    const visibleSnapshots = take === undefined
      ? sortedSnapshots
      : sortedSnapshots.slice(skip, skip + take)
```

with:

```ts
    // In the CRC view, absence of an explicit sample-column sort (or an
    // explicit crcWindowTotal sort) means rank by windowed CRC total desc.
    const crcTotalSortActive =
      interfaceView === 'crc' &&
      (interfaceSort === null || sort === 'crcWindowTotal')
    const crcSortDirection = dir === 'asc' ? 'asc' : 'desc'
    const sortedSnapshots = crcTotalSortActive
      ? sortByCrcWindowTotal(snapshots, crcTotals, crcSortDirection)
      : sortInterfaceRows(snapshots, interfaceSort ?? undefined)
    const visibleSnapshots = take === undefined
      ? sortedSnapshots
      : sortedSnapshots.slice(skip, skip + take)
```

- [ ] **Step 7: Attach `crcWindowTotal` to each row and pass new props**

In the `rows = visibleSnapshots.map(...)` return object, add after `dTxDiscards: latest?.dTxDiscards?.toString() ?? null,`:

```ts
        crcWindowTotal:
          interfaceView === 'crc'
            ? (crcTotals.get(s.id) ?? BigInt(0)).toString()
            : null,
```

Then in the `<InterfaceHealthClient .../>` JSX, update the `sortKey`/`sortDirection` props and add `window`:

```tsx
      sortKey={crcTotalSortActive ? 'crcWindowTotal' : interfaceSort?.key ?? null}
      sortDirection={crcTotalSortActive ? crcSortDirection : interfaceSort?.direction ?? 'desc'}
      counterMode={counterMode}
      view={interfaceView}
      window={crcWindow}
      crcTrend={crcTrend}
```

Note: `crcTotalSortActive`, `crcSortDirection`, and `crcTotals` are declared inside the `if (apic && ...)` block but referenced in the JSX return outside it. Hoist the three declarations: add `let crcTotalSortActive = false` and `let crcSortDirection: 'asc' | 'desc' = 'desc'` next to the existing `let rows` / `let crcTrend` declarations (lines 70-74), and change Step 6's `const crcTotalSortActive`/`const crcSortDirection` to plain assignments (`crcTotalSortActive =` / `crcSortDirection =`). `crcTotals` stays local since it is only read inside the block.

- [ ] **Step 8: Verify typecheck and build**

Run: `npx tsc --noEmit`
Expected: PASS. Two expected follow-on gaps (fixed in Task 5) will surface as type errors on the `window` prop and `crcWindowTotal` row field not existing on `InterfaceHealthClient`'s `Props`/`InterfaceRowProps`. If so, proceed to Task 5 and re-run there. If other errors appear, fix them here.

- [ ] **Step 9: Commit**

```bash
git add "src/app/(app)/interface-health/page.tsx"
git commit -m "feat(interface-health): compute per-port windowed CRC totals and 7d/30d window"
```

---

### Task 5: CRC windowed-total column, subtext, and 7d/30d toggle in the client

**Files:**

- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

**Interfaces:**

- Consumes: `TableSortKey` (Task 3); `window: '7d' | '30d'` and per-row `crcWindowTotal: string | null` (Task 4).
- Produces: final UI. No new exports.

Verified by typecheck + manual/build check (no unit tests for this client component).

- [ ] **Step 1: Import `TableSortKey` and add row + props fields**

Update the sort type import (lines 30-33):

```ts
import type {
  InterfaceSortDirection,
  InterfaceSortKey,
  TableSortKey,
} from './sort'
```

In `InterfaceRowProps` (after `dTxDiscards: string | null`), add:

```ts
  // Sum of positive CRC deltas over the active window (CRC view only); null in the All view.
  crcWindowTotal: string | null
```

In `Props`, change `view?: 'all' | 'crc'` grouping by adding a `window` prop and widening `sortKey`:

```ts
  sortKey: TableSortKey | null
  sortDirection: InterfaceSortDirection
  counterMode: CounterMode
  view?: 'all' | 'crc'
  window?: '7d' | '30d'
  crcTrend?: CrcTrendPoint[]
```

- [ ] **Step 2: Destructure `window` in the component signature**

In the `InterfaceHealthClient({ ... })` destructuring, add `window = '7d'` after `view = 'all'`:

```ts
  view = 'all',
  window = '7d',
  crcTrend = [],
```

- [ ] **Step 3: Add `window` to `buildUrl`**

In `buildUrl`'s `overrides` type (after `view?: 'all' | 'crc'`), add:

```ts
    window?: '7d' | '30d'
```

In the body, after `const v = overrides.view ?? view`, add:

```ts
    const win = overrides.window ?? window
```

And after the `if (v !== 'all') params.set('view', v)` line, add (window only matters in the CRC view):

```ts
    if (v === 'crc' && win !== '7d') params.set('window', win)
```

- [ ] **Step 4: Widen `sort` override types to `TableSortKey`**

In `buildUrl`'s `overrides` type, change `sort?: InterfaceSortKey | null` to `sort?: TableSortKey | null`. In `handleSort`, change the parameter type from `key: InterfaceSortKey` to `key: TableSortKey`.

- [ ] **Step 5: Add the window-change handler**

After `handleViewChange` (line 271-275), add:

```ts
  function handleWindowChange(w: '7d' | '30d') {
    startTransition(() => {
      router.replace(buildUrl({ window: w, page: 1 }))
    })
  }
```

- [ ] **Step 6: Make the CRC column window-aware in `tableHeaders`**

Replace the CRC header entry (lines 399-402):

```ts
    {
      label: counterMode === 'delta' ? 'CRC Δ' : 'CRC',
      sortKey: 'rxCrcErrors',
    },
```

with:

```ts
    view === 'crc'
      ? { label: `CRC (${window})`, sortKey: 'crcWindowTotal' as TableSortKey }
      : {
          label: counterMode === 'delta' ? 'CRC Δ' : 'CRC',
          sortKey: 'rxCrcErrors' as TableSortKey,
        },
```

Also widen the `tableHeaders` element type annotation (line 384) from `{ label: string; sortKey?: InterfaceSortKey }` to `{ label: string; sortKey?: TableSortKey }`.

- [ ] **Step 7: Render the windowed-total cell in the CRC view**

Replace the CRC `<td>` (lines 736-738):

```tsx
                            <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.rxCrcErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                              {counterMode === 'delta' ? fmtDelta(visibleCounters.rxCrcErrors) : fmtCount(visibleCounters.rxCrcErrors)}
                            </td>
```

with:

```tsx
                            {view === 'crc' ? (
                              <td className="px-4 py-2.5 tabular-nums">
                                <div className={isNonZero(r.crcWindowTotal) ? 'text-danger font-semibold' : 'text-faint'}>
                                  {fmtCount(r.crcWindowTotal)}
                                </div>
                                <div className="text-[10px] text-faint font-normal mt-0.5">
                                  {r.dRxCrcErrors === null
                                    ? 'reset'
                                    : `+${r.dRxCrcErrors} last poll`}
                                </div>
                              </td>
                            ) : (
                              <td className={['px-4 py-2.5 tabular-nums', isNonZero(visibleCounters.rxCrcErrors) ? 'text-danger font-semibold' : 'text-faint'].join(' ')}>
                                {counterMode === 'delta' ? fmtDelta(visibleCounters.rxCrcErrors) : fmtCount(visibleCounters.rxCrcErrors)}
                              </td>
                            )}
```

Note: `r.dRxCrcErrors` is the latest-sample CRC delta already present on the row (serialised string, or `null` for a reset). `fmtCount` renders the plain decimal total (`—` if null).

- [ ] **Step 8: Add the 7d/30d toggle (CRC view only)**

Immediately after the Delta/Current toggle `<div>` (closes at line 617), add:

```tsx
                {view === 'crc' && (
                  <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted p-0.5">
                    {(['7d', '30d'] as const).map(w => (
                      <button
                        key={w}
                        type="button"
                        aria-pressed={window === w}
                        onClick={() => handleWindowChange(w)}
                        className={[
                          'rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                          window === w
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                        ].join(' ')}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                )}
```

- [ ] **Step 9: Make the header count + empty-state copy window-aware**

Change the count suffix (line 624) from:

```tsx
                  {view === 'crc' && ' (CRC delta in last 7d)'}
```

to:

```tsx
                  {view === 'crc' && ` (CRC increase in last ${window})`}
```

And the CRC empty-state copy (lines 644-645) from:

```tsx
                      <p className="text-sm text-subtle">No interfaces with increasing CRC errors in the last 7 days</p>
                      <p className="text-xs text-faint mt-1">All monitored interfaces are reporting zero CRC error increases</p>
```

to:

```tsx
                      <p className="text-sm text-subtle">No interfaces with increasing CRC errors in the last {window === '30d' ? '30 days' : '7 days'}</p>
                      <p className="text-xs text-faint mt-1">All monitored interfaces are reporting zero CRC error increases</p>
```

- [ ] **Step 10: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors; the Task 4 follow-on gaps are now resolved).

- [ ] **Step 11: Verify the full test suite and build**

Run: `bun test && npx next build`
Expected: `bun test` PASS (including `crc-window.test.ts`); build completes with no type errors.

- [ ] **Step 12: Commit**

```bash
git add "src/app/(app)/interface-health/InterfaceHealthClient.tsx"
git commit -m "feat(interface-health): windowed CRC column, last-poll subtext, and 7d/30d toggle"
```

---

## Self-Review Notes

- **Spec coverage:** window param + groupBy-equivalent helper (Tasks 1, 4) → data layer §1; CRC column swap + subtext + default sort (Tasks 2, 4, 5) → table column §2; 7d/30d toggle (Task 5) → §3; dynamic header/empty-state + reset handling (Tasks 1, 5) → §4; helper + sort unit tests (Tasks 1, 2) → Testing. All spec sections mapped.
- **Behavior change called out in spec** (default-sort CRC view by total) is implemented in Task 4 Step 6.
- **Type consistency:** `crcWindowTotal` (string on the wire, bigint in helpers), `TableSortKey`, and `window: '7d' | '30d'` used identically across `page.tsx` and the client. `sumCrcByInterface`/`sortByCrcWindowTotal` signatures match between definition (Tasks 1-2) and use (Task 4).
