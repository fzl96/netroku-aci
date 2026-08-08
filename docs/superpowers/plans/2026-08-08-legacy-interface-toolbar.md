# Legacy Interface Toolbar and Data Views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Legacy Interfaces form toolbar with ACI-style immediate controls, add CRC/state-change views, and provide correct global natural table sorting.

**Architecture:** Pure list-state and list-data modules own URL canonicalization, sort transitions, natural ordering, current/delta selection, and CRC aggregation. A focused SQL module identifies state-changing interfaces. The authenticated page filters and enriches all matching current snapshots, sorts before pagination, and passes serializable rows to a client that owns immediate toolbar and header interactions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Tailwind CSS, Base UI dropdown primitives, Bun test, ESLint.

## Global Constraints

- Only currently present interfaces appear in all three views.
- Search updates after 300 ms; every other toolbar interaction updates immediately with `router.replace` and resets to page 1.
- Device is the only filter and supports multiple device IDs.
- Delta and All are defaults; CRC and State Changes default to a 7-day window and allow 30 days.
- CRC includes only positive summed CRC deltas in the selected window.
- State Changes detects either Admin or Oper transitions with one pre-window baseline.
- Hostname ascending is the default; interface names sort naturally.
- Sorting covers the complete matched set before pagination.
- Binary Admin/Oper UI, removed Speed column, raw drawer data, summaries, exact BigInt serialization, and authentication remain unchanged.

---

### Task 1: Canonical Legacy interface list state

**Files:**
- Create: `src/app/(app)/legacy/interfaces/list-state.ts`
- Create: `src/app/(app)/legacy/interfaces/list-state.test.ts`

**Interfaces:**
- Produces: `LegacyInterfaceView`, `LegacyInterfaceCounterMode`, `LegacyInterfaceWindow`, `LegacyInterfaceSortKey`, `LegacyInterfaceSortDirection`, `LegacyInterfaceListState`.
- Produces: `parseLegacyInterfaceListState(params)`, `buildLegacyInterfaceUrl(state)`, `nextLegacyInterfaceSort(currentKey, currentDirection, nextKey)`.

- [ ] **Step 1: Write failing list-state tests**

Use literal expectations for defaults, device deduplication, removed-filter ignorance, URL omission, and sort transitions:

```ts
expect(parseLegacyInterfaceListState({})).toEqual({
  query: '', deviceIds: [], view: 'all', mode: 'delta', window: '7d',
  sortKey: 'hostname', sortDirection: 'asc', page: 1, pageSize: 50,
})
expect(parseLegacyInterfaceListState({ device: 'd2,d1,d2' }).deviceIds).toEqual(['d2', 'd1'])
expect(buildLegacyInterfaceUrl({
  query: ' edge ', deviceIds: ['d2', 'd1'], view: 'crc', mode: 'current',
  window: '30d', sortKey: 'crcErrors', sortDirection: 'desc', page: 2, pageSize: 100,
})).toBe('/legacy/interfaces?query=edge&device=d2%2Cd1&view=crc&mode=current&window=30d&sort=crcErrors&page=2&pageSize=100')
expect(nextLegacyInterfaceSort('hostname', 'asc', 'ifName')).toEqual({ key: 'ifName', direction: 'asc' })
expect(nextLegacyInterfaceSort('ifName', 'asc', 'ifName')).toEqual({ key: 'ifName', direction: 'desc' })
expect(nextLegacyInterfaceSort('hostname', 'asc', 'inputErrors')).toEqual({ key: 'inputErrors', direction: 'desc' })
```

- [ ] **Step 2: Run RED**

Run: `bun test 'src/app/(app)/legacy/interfaces/list-state.test.ts'`

Expected: module-not-found failure.

- [ ] **Step 3: Implement the state module**

Define these exact keys and initial directions:

```ts
export const LEGACY_INTERFACE_SORT_KEYS = [
  'hostname', 'ifName', 'description', 'ipAddress', 'adminSt', 'operSt',
  'inputErrors', 'outputErrors', 'crcErrors', 'collectedAt',
] as const
const DESCENDING_FIRST = new Set<LegacyInterfaceSortKey>([
  'inputErrors', 'outputErrors', 'crcErrors', 'collectedAt',
])
```

Parse device IDs with trim/filter/deduplication and page values with existing Legacy helpers. Build parameters in test order. Omit defaults; include `sort=hostname` only for descending hostname. Omit `dir` when it matches the key's initial direction.

- [ ] **Step 4: Run GREEN**

Run: `bun test 'src/app/(app)/legacy/interfaces/list-state.test.ts'`

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(app)/legacy/interfaces/list-state.ts' 'src/app/(app)/legacy/interfaces/list-state.test.ts'
git commit -m "feat: add legacy interface list state"
```

### Task 2: Natural sorting and CRC aggregation

**Files:**
- Create: `src/app/(app)/legacy/interfaces/list-data.ts`
- Create: `src/app/(app)/legacy/interfaces/list-data.test.ts`

**Interfaces:**
- Consumes: Task 1 view/mode/sort types.
- Produces: `sumLegacyCrcByInterface(samples)` and `sortLegacyInterfaceRows(rows, sort)`.

- [ ] **Step 1: Write failing sorting tests**

Build literal rows and assert hostname default order produces `Ethernet1/1`, `Ethernet1/2`, `Ethernet1/10`. Assert Delta reads `dInputErrors`, Current reads `inputErrors`, CRC view reads `crcWindowTotal`, nulls sort last in both directions, ties fall through hostname/interface/ID, text is case-insensitive, and input arrays are not mutated.

```ts
expect(sortLegacyInterfaceRows(rows, {
  key: 'hostname', direction: 'asc', mode: 'delta', view: 'all',
}).map(row => row.ifName)).toEqual(['Ethernet1/1', 'Ethernet1/2', 'Ethernet1/10'])
expect(sortLegacyInterfaceRows(counterRows, {
  key: 'inputErrors', direction: 'desc', mode: 'delta', view: 'all',
}).map(row => row.id)).toEqual(['delta-10', 'delta-2', 'missing'])
```

- [ ] **Step 2: Write the failing CRC aggregation test**

```ts
expect(sumLegacyCrcByInterface([
  { interfaceId: 'if-1', dCrcErrors: 3n },
  { interfaceId: 'if-1', dCrcErrors: 2n },
  { interfaceId: 'if-1', dCrcErrors: null },
  { interfaceId: 'if-2', dCrcErrors: 0n },
  { interfaceId: 'if-3', dCrcErrors: -1n },
])).toEqual(new Map([['if-1', 5n]]))
```

- [ ] **Step 3: Run RED**

Run: `bun test 'src/app/(app)/legacy/interfaces/list-data.test.ts'`

- [ ] **Step 4: Implement sorting and aggregation**

Use `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })`. Parse serialized counters with guarded `BigInt`. Choose delta/raw fields from mode and `crcWindowTotal` for CRC view. Compare nullability before direction so null remains last. Apply hostname, interface, then ID as stable ascending tie-breakers.

```ts
export function sumLegacyCrcByInterface(samples: LegacyCrcDeltaSample[]) {
  const totals = new Map<string, bigint>()
  for (const sample of samples) {
    if (sample.dCrcErrors === null || sample.dCrcErrors <= 0n) continue
    totals.set(sample.interfaceId, (totals.get(sample.interfaceId) ?? 0n) + sample.dCrcErrors)
  }
  return totals
}
```

- [ ] **Step 5: Run GREEN and commit**

Run: `bun test 'src/app/(app)/legacy/interfaces/list-data.test.ts'`

```bash
git add 'src/app/(app)/legacy/interfaces/list-data.ts' 'src/app/(app)/legacy/interfaces/list-data.test.ts'
git commit -m "feat: add legacy interface natural sorting"
```

### Task 3: State-change window query

**Files:**
- Create: `src/app/(app)/legacy/interfaces/state-change-query.ts`
- Create: `src/app/(app)/legacy/interfaces/state-change-query.test.ts`

**Interfaces:**
- Produces: `buildLegacyStateChangedInterfaceIdsQuery(windowStart: Date): Prisma.Sql`.
- Produces: `queryLegacyStateChangedInterfaceIds(execute, windowStart): Promise<string[]>`.

- [ ] **Step 1: Write failing SQL contract tests**

```ts
const cutoff = new Date('2026-08-01T00:00:00Z')
const query = buildLegacyStateChangedInterfaceIdsQuery(cutoff)
const text = query.strings.join('?')
expect(text).toContain('legacy_interface_snapshot')
expect(text).toContain('legacy_interface_sample')
expect(text).toContain('JOIN LATERAL')
expect(text).toContain('LAG(')
expect(text).toContain('"previousAdminSt" IS DISTINCT FROM "adminSt"')
expect(text).toContain('"previousOperSt" IS DISTINCT FROM "operSt"')
expect(query.values).toContain(cutoff)
expect(await queryLegacyStateChangedInterfaceIds(
  async () => [{ interfaceId: 'if-1' }, { interfaceId: 'if-2' }], cutoff,
)).toEqual(['if-1', 'if-2'])
```

- [ ] **Step 2: Run RED**

Run: `bun test 'src/app/(app)/legacy/interfaces/state-change-query.test.ts'`

- [ ] **Step 3: Implement the SQL query**

Follow the ACI CTE structure using `legacy_interface_snapshot` and `legacy_interface_sample`: present-interface IDs, one `JOIN LATERAL` pre-window sample, union with in-window samples, `LAG` partitioned by interface and ordered by `collectedAt`, then distinct IDs where the in-window Admin or Oper value is distinct from its previous value.

```ts
export type LegacyStateChangeQueryExecutor = (
  query: Prisma.Sql,
) => Promise<Array<{ interfaceId: string }>>
```

- [ ] **Step 4: Run GREEN and commit**

Run: `bun test 'src/app/(app)/legacy/interfaces/state-change-query.test.ts'`

```bash
git add 'src/app/(app)/legacy/interfaces/state-change-query.ts' 'src/app/(app)/legacy/interfaces/state-change-query.test.ts'
git commit -m "feat: query legacy interface state changes"
```

### Task 4: Server-side data views and pagination

**Files:**
- Modify: `src/lib/legacy-ui/interfaces.ts`
- Modify: `src/lib/legacy-ui/interfaces.test.ts`
- Modify: `src/app/(app)/legacy/interfaces/page.tsx`
- Modify: `src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx` (prop types only)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: rows with `crcWindowTotal: string | null`, canonical list state, and device options.

- [ ] **Step 1: Add the failing view-ID filter test**

```ts
expect(buildLegacyInterfaceWhere({
  deviceIds: ['device-1'], interfaceIds: ['if-1', 'if-2'], presence: 'present',
})).toEqual({ AND: [
  { deviceId: { in: ['device-1'] } },
  { id: { in: ['if-1', 'if-2'] } },
  { present: true },
] })
expect(buildLegacyInterfaceWhere({ interfaceIds: [] })).toEqual({ AND: [{ id: { in: [] } }] })
```

- [ ] **Step 2: Run RED, implement, and run GREEN**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts`

Add `interfaceIds?: string[]` to `LegacyInterfaceFilters` and append `{ id: { in: filters.interfaceIds } }` whenever the property is defined, including `[]`. Rerun the test.

- [ ] **Step 3: Integrate list state and view queries**

Parse with `parseLegacyInterfaceListState`. Compute the 7d/30d cutoff. CRC view queries `{ interfaceId, dCrcErrors }` where cutoff applies and delta is positive, then aggregates. State Changes executes `queryLegacyStateChangedInterfaceIds(sql => prisma.$queryRaw(sql), cutoff)`. Pass qualifying IDs to `buildLegacyInterfaceWhere` with query, device IDs, and `presence: 'present'`.

- [ ] **Step 4: Sort before pagination**

Fetch the complete matched snapshot set with device and only its latest sample:

```ts
const snapshots = await prisma.legacyInterfaceSnapshot.findMany({
  where,
  include: {
    device: { select: { id: true, hostname: true, site: true, managementIp: true } },
    samples: { orderBy: { collectedAt: 'desc' }, take: 1 },
  },
})
```

Serialize CRC totals, call `sortLegacyInterfaceRows`, set total from the sorted length, then slice the requested page. Remove Admin/Oper/site option queries; retain devices and summaries.

- [ ] **Step 5: Update client prop types**

Add `crcWindowTotal: string | null` to `LegacyInterfaceRow`. Replace old filters/options with:

```ts
state: LegacyInterfaceListState
options: { devices: Array<{ id: string; hostname: string; site: string }> }
```

Map temporary existing reads to state so TypeScript stays valid for Task 5.

- [ ] **Step 6: Verify and commit**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts 'src/app/(app)/legacy/interfaces/list-state.test.ts' 'src/app/(app)/legacy/interfaces/list-data.test.ts' 'src/app/(app)/legacy/interfaces/state-change-query.test.ts'`

Run: `bun run lint -- src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts 'src/app/(app)/legacy/interfaces/page.tsx'`

```bash
git add src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts 'src/app/(app)/legacy/interfaces/page.tsx' 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx'
git commit -m "feat: add legacy interface data views"
```

### Task 5: Immediate toolbar and sortable headers

**Files:**
- Modify: `src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx`

**Interfaces:**
- Consumes: list state/URL/sort helpers, CRC totals, and device options.
- Produces: ACI-style controls with no form submission and accessible sortable headers.

- [ ] **Step 1: Add immediate navigation handlers**

Use `useRef`, `useTransition`, the filter and chevron icons, and dropdown checkbox primitives. Preserve state through one helper:

```ts
function navigate(overrides: Partial<LegacyInterfaceListState>) {
  startTransition(() => router.replace(buildLegacyInterfaceUrl({
    ...state,
    ...overrides,
    page: overrides.page ?? 1,
  })))
}
```

Debounce search 300 ms. Toggle device IDs and switch view/mode/window immediately.

- [ ] **Step 2: Replace the form toolbar**

Remove `FormEvent`, every select, and Apply. Render controlled search, a filter-icon dropdown labeled Device, `All / Counting CRC / State Changes`, `Delta / Current`, and conditional `7d / 30d` segmented controls. Copy the ACI toolbar button classes, display an active-filter badge, and keep the device checkbox menu open while toggling.

- [ ] **Step 3: Add clickable headers**

Create descriptors for Device, Interface, Description, IP, Admin, Operational, Input, Output, CRC, and Collected. Every header button calls:

```ts
const next = nextLegacyInterfaceSort(state.sortKey, state.sortDirection, key)
navigate({ sortKey: next.key, sortDirection: next.direction })
```

Set `aria-sort`, render the active chevron, and use mode-aware counter labels plus `CRC (7d|30d)` in CRC view.

- [ ] **Step 4: Render correct counter family**

```ts
const input = state.mode === 'delta' ? row.sample?.dInputErrors ?? null : row.sample?.inputErrors ?? null
const output = state.mode === 'delta' ? row.sample?.dOutputErrors ?? null : row.sample?.outputErrors ?? null
const crc = state.view === 'crc'
  ? row.crcWindowTotal
  : state.mode === 'delta' ? row.sample?.dCrcErrors ?? null : row.sample?.crcErrors ?? null
```

Use these values on desktop and mobile. Preserve binary Admin/Oper and omit Speed.

- [ ] **Step 5: Add loading and view-specific empty states**

Dim the results during transitions. If search/device is active, show filtered-empty guidance. Otherwise show CRC or State Changes window-specific copy, or existing ingestion guidance for All.

- [ ] **Step 6: Run final verification**

Run: `bun test`

Run: `bun run lint -- 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx' 'src/app/(app)/legacy/interfaces/page.tsx' 'src/app/(app)/legacy/interfaces/list-state.ts' 'src/app/(app)/legacy/interfaces/list-data.ts' 'src/app/(app)/legacy/interfaces/state-change-query.ts' src/lib/legacy-ui/interfaces.ts`

Run: `bun run build`

Run: `git diff --check main...HEAD`

- [ ] **Step 7: Commit**

```bash
git add 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx'
git commit -m "feat: align legacy interface toolbar with ACI"
```
