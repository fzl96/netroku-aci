# EPG Promise Consumption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace shallow EPG server-to-client forwarding modules with server-created promises consumed through React `use()`, and consolidate table pagination into the table module.

**Architecture:** `EpgShell` remains the server orchestrator. It starts one host-context promise, derives shared overview and results promises without awaiting them, and passes those promises through three independent Suspense boundaries. Interactive EPG modules consume serializable load states with `use()`, while the internal server `EpgBody` remains responsible for redirect, authorization, and no-host rendering.

**Tech Stack:** Next.js 16 App Router, React 19 Server and Client Components, React `use()` and Suspense, TypeScript, Bun test, Tailwind CSS.

---

### Task 1: Lock the simplified module architecture with a failing test

**Files:**

- Modify: `src/components/epgs/epgs-skeleton.test.tsx`

**Step 1: Write the failing architecture assertions**

Update the architecture test to read the shell, route, and three interactive region files. Assert that:

```tsx
expect(pageSource).toContain('<EpgShell')
expect(shellSource).toContain('const overviewPromise')
expect(shellSource).toContain('const resultsPromise')
expect(filterSource).toContain("'use client'")
expect(filterSource).toContain('use(dataPromise)')
expect(headerSource).toContain('use(dataPromise)')
expect(resultsSource).toContain('use(dataPromise)')
```

Also assert that these obsolete forwarding modules no longer exist:

```tsx
for (const obsolete of [
  'epg-filters-client.tsx',
  'epg-header-actions-client.tsx',
  'epg-results-client.tsx',
  'epgs-view.tsx',
]) {
  expect(existsSync(path.join(epgRoot, obsolete))).toBe(false)
}
```

Retain the checks for three independent Suspense boundaries and no whole-body boundary.

**Step 2: Run the test to verify it fails**

Run:

```bash
bun test src/components/epgs/epgs-skeleton.test.tsx
```

Expected: FAIL because the route still renders `EpgsView`, the interactive files do not call `use(dataPromise)`, and the forwarding modules still exist.

**Step 3: Do not change production code yet**

The failing assertions are the contract for Tasks 2 and 3.

### Task 2: Create serializable promise load states and server orchestration

**Files:**

- Modify: `src/lib/epgs/query.ts`
- Modify: `src/components/epgs/epg-shell.tsx`
- Modify: `src/app/(app)/epgs/page.tsx`
- Delete: `src/components/epgs/epgs-view.tsx`

**Step 1: Define the narrow promise payload interface**

Near the existing EPG query result types, add serializable load-state types:

```ts
export type EpgLoadState<T> =
  | { kind: 'ready'; data: T }
  | { kind: 'inactive' }
  | { kind: 'unauthorized' }

export type EpgOverviewPayload = {
  params: EpgPageParams
  hosts: EpgHostOption[]
  overview: EpgOverviewData
}

export type EpgResultsPayload = {
  params: EpgPageParams
  results: EpgResultsData
}
```

These values may cross the RSC seam; do not include `Error` instances, functions, Prisma values, or unresolved class instances.

**Step 2: Start all promises in `EpgShell`**

Change `EpgShell` to accept only `paramsPromise`. During its synchronous render:

```tsx
const pagePromise = resolvePageContext(paramsPromise)
const overviewPromise = loadOverview(pagePromise)
const resultsPromise = loadResults(pagePromise)
```

`resolvePageContext` must map expected `EpgReadError` failures to an unauthorized page state while preserving `selected`, `redirect`, and `empty` host outcomes. Unexpected errors must be rethrown.

`loadOverview` and `loadResults` must both derive from the same `pagePromise`. For a ready context they call `getEpgOverview` and `getEpgResults` respectively. Since neither loader awaits the other, both queries begin concurrently after host validation. Map only `EpgReadError` to `{ kind: 'unauthorized' }`; rethrow unexpected errors.

**Step 3: Keep routing and no-host behavior in `EpgBody`**

Have `EpgBody` await `pagePromise` and handle:

```tsx
if (context.kind === 'unauthorized') return <EpgRegionError region="overview" />
if (context.kind === 'redirect') redirect(context.location)
if (context.kind === 'empty') return <NoEpgHost />
```

For a ready context, render `EpgFilters` and `EpgResults` in their existing independent Suspense boundaries and pass their data promises. Use `context.params.view` directly in the results skeleton so the pass-through `EpgResultsFallback` helper can be deleted.

Pass the shared overview promise to `EpgHeaderActions` in the header Suspense boundary.

**Step 4: Render the shell directly from the route**

Replace the `EpgsView` import with `EpgShell`:

```tsx
return <EpgShell paramsPromise={searchParams.then(parseEpgPageParams)} />
```

Then delete `epgs-view.tsx`.

**Step 5: Run the focused architecture test**

Run:

```bash
bun test src/components/epgs/epgs-skeleton.test.tsx
```

Expected: still FAIL only on the unmerged Client Component assertions and obsolete forwarding files.

### Task 3: Fold each interactive client implementation into its public module

**Files:**

- Modify: `src/components/epgs/epg-header-actions.tsx`
- Modify: `src/components/epgs/epg-filters.tsx`
- Modify: `src/components/epgs/epg-results.tsx`
- Delete: `src/components/epgs/epg-header-actions-client.tsx`
- Delete: `src/components/epgs/epg-filters-client.tsx`
- Delete: `src/components/epgs/epg-results-client.tsx`

**Step 1: Convert the three public modules to Client Components**

Add `'use client'` and merge each former `*-client.tsx` implementation into its corresponding public module. Each public interface accepts one stable server-created promise:

```tsx
export function EpgFilters({
  dataPromise,
}: {
  dataPromise: Promise<EpgLoadState<EpgOverviewPayload>>
})
```

Use the equivalent overview payload for header actions and results payload for results.

**Step 2: Read each promise with `use()`**

Call existing React hooks in a stable order, then unwrap the resource:

```tsx
const state = use(dataPromise)
if (state.kind === 'unauthorized') return <EpgRegionError region="overview" />
if (state.kind === 'inactive') return null
const { params, overview } = state.data
```

Use the compact error variant for header actions and the results region for results. Do not call `use()` inside `try/catch`, and do not create or transform promises inside the Client Components.

**Step 3: Preserve interactions unchanged**

Keep `router.replace()` in APIC selection and filters, `router.refresh()` after a successful resync, local `useTransition()` pending state, result-row selection, and detail panels.

**Step 4: Delete the forwarding files and run the architecture test**

Run:

```bash
bun test src/components/epgs/epgs-skeleton.test.tsx
```

Expected: PASS.

**Step 5: Commit the promise refactor**

```bash
git add 'src/app/(app)/epgs/page.tsx' src/components/epgs src/lib/epgs/query.ts
git commit -m "refactor: consume epg data promises in clients"
```

### Task 4: Consolidate the EPG table and pagination module

**Files:**

- Rename: `src/components/epgs/epg-table-client.tsx` to `src/components/epgs/epg-table.tsx`
- Rename: `src/components/epgs/epg-table-client.test.tsx` to `src/components/epgs/epg-table.test.tsx`
- Delete: `src/components/epgs/epg-pagination-client.tsx`
- Modify: `src/components/epgs/epg-results.tsx`

**Step 1: Update the table test first**

Mock `next/navigation` with a stable router replacement function, import `EpgTable`, and pass both `params` and complete `results`. Preserve the existing stagger assertions and add a pagination assertion:

```tsx
expect(markup).toContain('Showing 1–2 of 2 EPGs')
expect(markup.match(/animate-fade-up/g)).toHaveLength(2)
expect(markup).toContain('animation-delay:20ms')
```

Add the equivalent `ports` assertion for the port view.

**Step 2: Run the test to verify it fails**

Run:

```bash
bun test src/components/epgs/epg-table.test.tsx
```

Expected: FAIL because `epg-table.tsx` and the combined `EpgTable` interface do not exist yet.

**Step 3: Move pagination into `epg-table.tsx`**

Rename the table module and component to `EpgTable`. Move `PAGE_SIZES`, range calculation, pending transition, and URL replacement from `epg-pagination-client.tsx` into the same module as an internal `EpgPagination` function.

The public table interface must be:

```tsx
export function EpgTable({
  params,
  results,
  onEpgSelect,
  onPortSelect,
}: {
  params: EpgPageParams
  results: EpgResultsData
  onEpgSelect: (id: string) => void
  onPortSelect: (port: EpgPortSummary) => void
})
```

Return the bordered table container and pagination as one fragment. Preserve row stagger timing at `20ms` per row capped at `200ms`.

**Step 4: Use the combined table interface from results**

For non-empty results, render one `EpgTable` with `params`, `results`, and selection callbacks. Keep empty messaging and both detail panels in `epg-results.tsx`.

Delete `epg-pagination-client.tsx`.

**Step 5: Run focused tests**

Run:

```bash
bun test src/components/epgs/epg-table.test.tsx src/components/epgs/epgs-skeleton.test.tsx
```

Expected: PASS.

**Step 6: Commit table consolidation**

```bash
git add src/components/epgs
git commit -m "refactor: colocate epg table pagination"
```

### Task 5: Verify the complete refactor

**Files:**

- Verify all changed EPG and route files

**Step 1: Check for stale imports and obsolete files**

Run:

```bash
rg -n "EpgsView|EpgFiltersClient|EpgHeaderActionsClient|EpgResultsClient|EpgPaginationClient|EpgTableClient" src
```

Expected: no matches.

**Step 2: Run all tests**

```bash
bun test
```

Expected: all non-integration tests pass; the two PostgreSQL integration tests may remain skipped.

**Step 3: Run static verification**

```bash
bun run lint
bun run format:check
bun run build
```

Expected: lint has no errors, formatting passes, and the production build exits successfully.

**Step 4: Inspect repository state**

```bash
git status --short
git log -5 --oneline
```

Expected: only intentional implementation-plan changes remain. Commit the plan or final adjustments separately if needed.
