# Endpoint Table Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users sort every column in the Endpoints table in ascending or descending order in both endpoint and port views.

**Architecture:** Add pure comparison helpers to the existing endpoint sorting module. Keep transient selected-column and direction state in `EndpointsClient`, derive sorted copies of the already paginated server data, and render those same arrays for desktop and mobile. The existing server query ordering remains the no-selection default.

**Tech Stack:** Next.js 16, React 19, TypeScript, Bun test, Prisma endpoint types, Tabler icons.

## Global Constraints

- Sort only the currently loaded page; do not add URL parameters, alter Prisma queries, pagination, filters, or exports.
- Preserve existing order until a column is selected; use original-index ordering as a stable tie-breaker.
- Text ordering is natural and case-insensitive; dates and counts are chronological/numeric; ascending status orders active before historical.
- Missing values sort after populated values ascending and before them descending.
- Use accessible table-header buttons and convey active sort direction with text and an icon.

---

## File structure

- Modify `src/app/(app)/endpoints/sort.ts`: define sort-key/direction types and pure sort functions for endpoint and port rows while retaining port grouping.
- Modify `src/app/(app)/endpoints/sort.test.ts`: specify the sorting contract with real representative rows.
- Modify `src/app/(app)/endpoints/EndpointsClient.tsx`: own sort state, derive render arrays, and make desktop headers interactive.

### Task 1: Pure endpoint and port sorting helpers

**Files:**

- Modify: `src/app/(app)/endpoints/sort.ts`
- Test: `src/app/(app)/endpoints/sort.test.ts`

**Interfaces:**

- Consumes: Prisma `Endpoint` and local `EndpointPortSummary`.
- Produces: `EndpointSortKey`, `PortSortKey`, `SortDirection`, `sortEndpointRows(endpoints, key, direction)`, and `sortPortRows(ports, key, direction)`.

- [ ] **Step 1: Write failing tests for endpoint field ordering and port aggregate ordering**

```ts
import { sortEndpointRows, sortPortRows } from './sort'

it('sorts endpoint dates and status in either direction without mutating input', () => {
  const rows = [
    endpoint({ id: 'historical', lastSeenAt: new Date('2026-01-02'), isActive: false }),
    endpoint({ id: 'active', lastSeenAt: new Date('2026-01-01'), isActive: true }),
    endpoint({ id: 'missing', lastSeenAt: null }),
  ]

  expect(sortEndpointRows(rows, 'lastSeenAt', 'asc').map(row => row.id)).toEqual(['active', 'historical', 'missing'])
  expect(sortEndpointRows(rows, 'status', 'asc').map(row => row.id)).toEqual(['active', 'historical', 'missing'])
  expect(rows.map(row => row.id)).toEqual(['historical', 'active', 'missing'])
})

it('sorts port counts numerically and text naturally', () => {
  const rows = [
    port({ id: 'eth10', interface: 'eth1/10', endpointCount: 2 }),
    port({ id: 'eth2', interface: 'eth1/2', endpointCount: 10 }),
  ]

  expect(sortPortRows(rows, 'interface', 'asc').map(row => row.id)).toEqual(['eth2', 'eth10'])
  expect(sortPortRows(rows, 'endpointCount', 'desc').map(row => row.id)).toEqual(['eth2', 'eth10'])
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test src/app/(app)/endpoints/sort.test.ts`

Expected: FAIL because `sortEndpointRows` and `sortPortRows` are not exported.

- [ ] **Step 3: Implement the helpers in `sort.ts`**

```ts
export type SortDirection = 'asc' | 'desc'
export type EndpointSortKey = 'mac' | 'ip' | 'vlan' | 'node' | 'interface' | 'epgDescr' | 'firstSeenAt' | 'lastSeenAt' | 'status'
export type PortSortKey = 'node' | 'interface' | 'endpointCount' | 'vlans' | 'epgDescrs' | 'lastSeenAt'

export function sortEndpointRows(rows: Endpoint[], key: EndpointSortKey, direction: SortDirection): Endpoint[] {
  return stableSort(rows, (a, b) => endpointComparison(a, b, key), direction)
}

export function sortPortRows(rows: EndpointPortSummary[], key: PortSortKey, direction: SortDirection): EndpointPortSummary[] {
  return stableSort(rows, (a, b) => portComparison(a, b, key), direction)
}
```

Implement `stableSort` with each row's input index as the final tie-breaker. Have the comparison helpers select the typed value, handle null/empty values before comparing, use the existing `NATURAL_COLLATOR` for strings, `getTime()` for dates, numeric subtraction for counts, and `isActive` rank (`true` before `false`) for endpoint status.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `bun test src/app/(app)/endpoints/sort.test.ts`

Expected: PASS with the existing grouping test and the new sorting tests.

- [ ] **Step 5: Commit the pure sorting behavior**

```bash
git add 'src/app/(app)/endpoints/sort.ts' 'src/app/(app)/endpoints/sort.test.ts'
git commit -m "feat: add endpoint table sort helpers"
```

### Task 2: Sortable endpoint-table headers and shared rendering order

**Files:**

- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`
- Test: `src/app/(app)/endpoints/sort.test.ts`

**Interfaces:**

- Consumes: `sortEndpointRows`, `sortPortRows`, `EndpointSortKey`, `PortSortKey`, and `SortDirection` from `./sort`.
- Produces: Client-side header interaction that updates the sort state and uses sorted data in desktop and mobile render paths.

- [ ] **Step 1: Write a failing behavior test for toggle state**

```ts
import { nextSortState } from './sort'

it('starts new columns ascending and toggles the active column direction', () => {
  expect(nextSortState(undefined, undefined, 'mac')).toEqual({ key: 'mac', direction: 'asc' })
  expect(nextSortState('mac', 'asc', 'mac')).toEqual({ key: 'mac', direction: 'desc' })
  expect(nextSortState('mac', 'desc', 'node')).toEqual({ key: 'node', direction: 'asc' })
})
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `bun test src/app/(app)/endpoints/sort.test.ts`

Expected: FAIL because `nextSortState` is not exported.

- [ ] **Step 3: Add `nextSortState` and wire it into `EndpointsClient`**

```ts
export function nextSortState<K extends string>(
  currentKey: K | undefined,
  currentDirection: SortDirection | undefined,
  nextKey: K,
): { key: K; direction: SortDirection } {
  return currentKey === nextKey && currentDirection === 'asc'
    ? { key: nextKey, direction: 'desc' }
    : { key: nextKey, direction: 'asc' }
}
```

In `EndpointsClient.tsx`, import the helpers and `IconChevronUp`/`IconChevronDown`. Add independent endpoint and port sort states so changing view retains that view's selection. Define header metadata as `{ label, key }` arrays and render each label in a `<button type="button">`. The button calls `nextSortState`, has `aria-label` naming the next action, and shows the active direction icon. Derive `displayedEndpoints` and `displayedPorts` only when a corresponding key is selected; otherwise use the incoming arrays unchanged. Replace every endpoint/port mapping in the desktop and mobile layouts with those displayed arrays.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `bun test src/app/(app)/endpoints/sort.test.ts`

Expected: PASS with sorting and toggle behavior covered.

- [ ] **Step 5: Run static checks and a production build**

Run: `bun test && bun run lint && bun run build`

Expected: each command exits 0.

- [ ] **Step 6: Commit the table interaction**

```bash
git add 'src/app/(app)/endpoints/EndpointsClient.tsx' 'src/app/(app)/endpoints/sort.ts' 'src/app/(app)/endpoints/sort.test.ts'
git commit -m "feat: add sortable endpoint table columns"
```
