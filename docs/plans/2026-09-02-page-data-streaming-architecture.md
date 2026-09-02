# Page Data Streaming Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move all in-scope page reads and writes behind purpose-owned server modules, render synchronous page shells with independent Suspense regions, and add tagged eight-hour caching with immediate invalidation after durable writes.

**Architecture:** Each `page.tsx` is a synchronous Next.js adapter that converts framework props into a purpose-owned promise and renders a view from `src/components/<purpose>/`. Server-only `src/lib/<purpose>/query.ts` modules authorize, query Prisma, cache shared data, and return safe shapes; server-only mutation modules own durable writes while optional `actions.ts` files expose only browser-invoked mutations. Existing workflow routes remain unchanged.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components and Suspense, TypeScript, Prisma 6/PostgreSQL, Better Auth, Bun test runner, `unstable_cache`, `revalidateTag`, Tailwind CSS.

---

## Progress

> Update this table as the **last edit before each slice's commit**, so the status rides along in
> that commit and cannot drift. A resuming session should trust, in order: (1) `git log`, (2) the
> `MIGRATED_PURPOSES` registry in `src/lib/page-architecture.test.ts` plus a `bun test` run, (3) this
> table. Deviations from the task order go in the Notes column — no other artifact can record them.

| Task | Purpose | Status | Landed as / Notes |
| --- | --- | --- | --- |
| 1 | Guardrails + Endpoints params | done | `c476df5` test: define page data architecture guardrails |
| 2 | Endpoints query depth | done | `0c0cd8d` refactor: deepen endpoint query boundary |
| 3 | Endpoints writes | done | `c2be982` refactor: centralize endpoint writes and invalidation |
| 4 | Endpoints streaming | done | `28968a9`, hardened by `283c501` |
| 5 | EPGs | done | `0870a10`, hardened by `f057262` |
| 6 | Interface Health | done | Originally skipped by the 2026-09-02 session with no reason recorded (it jumped straight to Task 7); resumed after 7/8/History landed. Landed across four commits: `refactor: relocate interface health modules to purpose directories`, `test: add typed interface health page parameters`, `refactor: move interface health reads and writes behind purpose modules`, `refactor: stream interface health regions`; cache identity and export DTO boundaries hardened by `fix: harden streamed data boundaries`. Two deliberate behaviour changes: the Export button is no longer disabled on an empty table (the route already answers 422, and the header must not wait on results), and the `window` param is dropped from URLs outside the CRC/state-change views that use it. |
| 7 | Nodes | done | `refactor: stream node inventory regions`; retryable data reads and obsolete-action cleanup hardened by `fix: harden streamed data boundaries` |
| 8 | Dashboard | done | `refactor: stream dashboard regions`; APIC-host cache invalidation hardened by `fix: harden streamed data boundaries` |
| 9 | Legacy (4 purposes) | not started | |
| 10 | Inventory split | not started | |
| 11 | APIC Hosts / Scheduler / Users / History / Settings | partial | History landed as `refactor: stream history regions` (audit writes now invalidate `history:all`); retryable data reads were hardened by `fix: harden streamed data boundaries`. APIC Hosts, Scheduler, Users, Settings not started. |
| 12 | Final sweep | not started | |

**Known deviation from the plan text:** Task 11 was started out of order (History only) before Task 6.
The guard registry is the source of truth for which purposes are actually migrated.

**Verification lesson:** `bun test` + `bunx tsc --noEmit` were green while `bun run build` was broken —
the History slice moved `buildHistoryWhere` / `historyPageWindow` out of `query.ts` but left the obsolete
`src/actions/audit.ts` importing them, and those errors sat in the pre-existing tsc noise from test files.
**Run `bun run build` before claiming a slice is done**, and treat "the tsc error count did not change" as
insufficient — check which files the errors are in.

## Required skills and invariants

- Use `@superpowers:test-driven-development` for every behavior change.
- Use `@vercel-react-best-practices` while splitting React render modules.
- Use `@superpowers:verification-before-completion` before every checkpoint claim.
- Use `@superpowers:requesting-code-review` after each purpose slice.
- Keep `bridge-domains/**`, `bridge-domains/epgs/**`, `static-ports/**`, and `interface-selectors/**` unchanged.
- Do not add `loading.tsx`; remove Dashboard's existing one during its slice.
- Do not add a public Prisma adapter solely for tests.
- Use kebab-case for all new non-framework filenames.
- Keep `src/components/ui/` reserved for shadcn.
- Commit after each green vertical slice; never leave duplicate old and new entry paths.

## Reference templates

Use these templates consistently. Adapt names and shapes to each purpose; do not create abstractions merely to eliminate a few repeated lines.

### Synchronous route adapter

```tsx
import type { Metadata } from 'next'
import { EndpointsView } from '@/components/endpoints/endpoints-view'
import { parseEndpointPageParams } from '@/lib/endpoints/params'

export const metadata: Metadata = {
  title: 'Endpoints',
  description: 'Browse active and historical endpoints learned by the APIC fabric.',
}

export default function Page({ searchParams }: PageProps<'/endpoints'>) {
  const pageParams = searchParams.then(parseEndpointPageParams)
  return <EndpointsView pageParams={pageParams} />
}
```

### Purpose query with authorization outside persistent cache

```ts
import 'server-only'

import { unstable_cache } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const EIGHT_HOURS_SECONDS = 8 * 60 * 60

function readCachedOverview(hostId: string) {
  return unstable_cache(
    async () => {
      // Prisma orchestration and safe-shape serialization live here.
    },
    ['endpoints', 'overview', hostId],
    {
      tags: ['endpoints:all', `endpoints:host:${hostId}`],
      revalidate: EIGHT_HOURS_SECONDS,
    },
  )()
}

export async function getEndpointOverview(hostId: string) {
  await requireSession()
  return readCachedOverview(hostId)
}
```

Do not read cookies, headers, or session state inside `unstable_cache`. Serialize dates before crossing into client render modules.

### Purpose mutation and invalidation

```ts
import 'server-only'

import { revalidateTag } from 'next/cache'

export function invalidateEndpointReads(hostId: string) {
  revalidateTag('endpoints:all', { expire: 0 })
  revalidateTag(`endpoints:host:${hostId}`, { expire: 0 })
}

export async function resyncEndpointInventory(input: ResyncInput) {
  // Authorize, perform durable write, and record audit first.
  const result = await performResync(input)
  invalidateEndpointReads(input.apicHostId)
  return result
}
```

Invalidate only after the durable write succeeds. Partial multi-dataset resyncs invalidate each successful dataset independently.

### Streaming view

```tsx
import { Suspense } from 'react'
import type { EndpointPageParams } from '@/lib/endpoints/params'
import { EndpointOverview } from './endpoint-overview'
import { EndpointOverviewSkeleton, EndpointResultsSkeleton } from './endpoints-skeleton'
import { EndpointResults } from './endpoint-results'

export function EndpointsView({
  pageParams,
}: {
  pageParams: Promise<EndpointPageParams>
}) {
  return (
    <main className="min-h-full bg-background">
      <header>{/* stable title and description */}</header>
      <Suspense fallback={<EndpointOverviewSkeleton />}>
        <EndpointOverview pageParams={pageParams} />
      </Suspense>
      <Suspense fallback={<EndpointResultsSkeleton />}>
        <EndpointResults pageParams={pageParams} />
      </Suspense>
    </main>
  )
}
```

The actual Endpoints implementation must share one host-resolution promise between Overview and Results so redirect/selection occurs once. Preserve the existing client-side pending-table feedback for URL transitions.

## Task 1: Add migration guardrails and typed Endpoints parameters

**Files:**
- Create: `src/lib/page-architecture.test.ts`
- Create: `src/lib/endpoints/params.ts`
- Create: `src/lib/endpoints/params.test.ts`
- Modify: `src/lib/endpoints/query.ts`
- Modify: `src/lib/endpoints/query.test.ts`

**Step 1: Write the failing architecture test**

Create the reusable guard with an initially empty `MIGRATED_PURPOSES` table and test its matcher against small inline fixture strings. Each slice adds its purpose immediately before performing that slice's red-green migration. For a migrated purpose, recursively read only that purpose's route, render, action, and route-handler files and assert:

```ts
expect(source).not.toContain("@/lib/prisma")
expect(pageSource).not.toContain("@/actions/")
expect(pageSource).not.toContain('getSession')
expect(loadingFiles).toEqual([])
```

Also assert that the migrated `src/app/(app)/endpoints/` directory contains only `page.tsx` after the slice finishes. Keep an explicit allowlist for Next framework files so later dynamic routes can retain `layout.tsx`, `error.tsx`, or `not-found.tsx` when justified.

**Step 2: Run the guard to verify it fails**

Run: `bun test src/lib/page-architecture.test.ts`

Expected: PASS for the guard infrastructure with no migrated purposes registered yet.

**Step 3: Write failing parameter tests**

Cover repeated query keys, invalid page/page-size values, both view modes, comma-separated filters, invalid statuses, whitespace trimming, and canonical URL generation. The normalized type must include host, view, query, page, page size, VLANs, nodes, interfaces, and statuses.

**Step 4: Run parameter tests to verify they fail**

Run: `bun test src/lib/endpoints/params.test.ts`

Expected: FAIL because `params.ts` does not exist.

**Step 5: Implement the pure parameter module**

Move parsing and URL-building behavior out of `page.tsx` and `EndpointsClient.tsx`. Make the parser accept Next's raw `string | string[] | undefined` values and return a stable `EndpointPageParams` safe for cache keys.

Keep Prisma predicate builders in `query.ts`; move only URL-domain behavior to `params.ts`.

**Step 6: Run focused tests**

Run: `bun test src/lib/endpoints/params.test.ts src/lib/endpoints/query.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/page-architecture.test.ts src/lib/endpoints/params.ts src/lib/endpoints/params.test.ts src/lib/endpoints/query.ts src/lib/endpoints/query.test.ts
git commit -m "test: define page data architecture guardrails"
```

Keep the repository green. Endpoints is registered in the guard at the start of Task 4, where the same task takes the new failure back to green before committing.

## Task 2: Deepen the Endpoints query module

**Files:**
- Modify: `src/lib/endpoints/query.ts`
- Modify: `src/lib/endpoints/query.test.ts`
- Create: `src/lib/endpoints/query-data.test.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/actions/apic-hosts.ts`

**Step 1: Write failing query-interface tests**

Use Bun module substitution for `@/lib/prisma`, `@/lib/auth`, and `next/cache`. Test observable results through the Endpoints query interface:

- unauthenticated calls reject or redirect before Prisma executes;
- missing/unknown host resolution produces the canonical first-host redirect decision;
- overview returns active/historical counts and normalized filter choices;
- results returns endpoint rows or grouped port rows with clamped pagination;
- returned dates are serialized;
- cached reads receive `endpoints:all` and `endpoints:host:<id>` tags with `28800` seconds;
- repeated regions share the same normalized params without reparsing.

**Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/endpoints/query-data.test.ts`

Expected: FAIL because the deep query interface is absent.

**Step 3: Implement host resolution, overview, results, and export reads**

Deepen `query.ts` rather than layering a second pass-through file. Absorb the current Prisma orchestration from `src/app/(app)/endpoints/page.tsx` and `src/app/api/endpoints/export/route.ts`. Keep `buildEndpointWhere`, node expansion, and port grouping internal or purpose-local.

Use request-scoped React `cache()` for host resolution shared by regions. Place persistent Prisma reads behind `unstable_cache`; authorize before entering each cache scope.

Add reusable request-scoped `requireSession()` and `requireAdmin()` helpers to `src/lib/auth.ts`; they may wrap the existing cached session lookup but must preserve current redirects/error semantics expected by their callers.

**Step 4: Stop using the broad APIC host action for Endpoints reads**

The Endpoints query module owns the safe host-selection shape. Do not import `getApicHosts` from a page or render module.

**Step 5: Run focused tests**

Run: `bun test src/lib/endpoints/query.test.ts src/lib/endpoints/query-data.test.ts src/lib/endpoints/params.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/lib/endpoints src/actions/apic-hosts.ts
git commit -m "refactor: deepen endpoint read module"
```

## Task 3: Move Endpoints writes and exports behind purpose modules

**Files:**
- Create: `src/lib/endpoints/mutation.ts`
- Create: `src/lib/endpoints/mutation.test.ts`
- Modify: `src/lib/endpoints/export.ts`
- Modify: `src/lib/endpoints/export.test.ts`
- Modify: `src/app/api/endpoints/resync/route.ts`
- Modify: `src/app/api/endpoints/export/route.ts`
- Modify: `src/lib/apic/resync-host.ts`
- Modify: `src/lib/apic/cron-resync.test.ts`

**Step 1: Write failing mutation tests**

Test manual authorization, host lookup, APIC resync invocation, audit recording, `409` in-progress classification, safe errors, and immediate invalidation of both endpoint tags. Add a scheduler case proving the same invalidation implementation runs after a successful scheduled endpoint resync.

**Step 2: Run mutation tests to verify they fail**

Run: `bun test src/lib/endpoints/mutation.test.ts src/lib/apic/cron-resync.test.ts`

Expected: FAIL because `mutation.ts` does not exist and scheduler resync does not invalidate.

**Step 3: Implement the deep mutation module**

Move manual resync host lookup, audit behavior, error classification, and cache expiration out of the route handler. Keep low-level APIC synchronization in `src/lib/apic/endpoints.ts`. Provide a trusted scheduler entry that shares the durable implementation and invalidation without pretending to be an interactive user.

**Step 4: Reduce resync route to a transport adapter**

The route may parse JSON and translate safe mutation results to status codes. It must not import Prisma, audit implementation, or low-level APIC synchronization directly.

**Step 5: Deepen export reads**

Move host validation and endpoint selection into `lib/endpoints/query.ts`; keep workbook construction in `export.ts`. The export route validates the request, calls the purpose interface, and constructs the HTTP response.

**Step 6: Run focused tests**

Run: `bun test src/lib/endpoints src/lib/apic/cron-resync.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/endpoints src/app/api/endpoints src/lib/apic/resync-host.ts src/lib/apic/cron-resync.test.ts
git commit -m "refactor: centralize endpoint writes and invalidation"
```

## Task 4: Build the streamed Endpoints render modules

**Files:**
- Create: `src/components/endpoints/endpoints-view.tsx`
- Create: `src/components/endpoints/endpoint-overview.tsx`
- Create: `src/components/endpoints/endpoint-results.tsx`
- Create: `src/components/endpoints/endpoints-skeleton.tsx`
- Create: `src/components/endpoints/endpoints-skeleton.test.tsx`
- Create: `src/components/endpoints/endpoint-region-error.tsx`
- Move/modify: `src/app/(app)/endpoints/EndpointsClient.tsx` → `src/components/endpoints/endpoints-client.tsx`
- Move/modify: `src/app/(app)/endpoints/ExportEndpointsDialog.tsx` → `src/components/endpoints/export-endpoints-dialog.tsx`
- Move/modify: `src/app/(app)/endpoints/PortDetailPanel.tsx` → `src/components/endpoints/port-detail-panel.tsx`
- Move: `src/app/(app)/endpoints/sort.ts` → `src/lib/endpoints/sort.ts`
- Move: `src/app/(app)/endpoints/sort.test.ts` → `src/lib/endpoints/sort.test.ts`
- Move: `src/app/(app)/endpoints/export-utils.ts` → `src/lib/endpoints/export-utils.ts`
- Move: `src/app/(app)/endpoints/export-utils.test.ts` → `src/lib/endpoints/export-utils.test.ts`
- Modify: `src/app/(app)/endpoints/page.tsx`

**Step 1: Write failing skeleton and composition tests**

Render skeletons to static markup and assert accessible busy labels plus visual structures matching the overview controls and both result-table modes. Add a source-level assertion that `endpoints-view.tsx` contains separate Suspense regions for Overview and Results.

Add Endpoints to `MIGRATED_PURPOSES` and run `bun test src/lib/page-architecture.test.ts`; verify it now fails against the current route before moving files.

**Step 2: Run tests to verify they fail**

Run: `bun test src/components/endpoints/endpoints-skeleton.test.tsx`

Expected: FAIL because the render modules do not exist.

**Step 3: Move existing render behavior with no visual regression**

Move files using history-preserving renames. Split the current all-data `EndpointsClient` interface into purpose shapes consumed by Overview and Results. Keep URL state authoritative and preserve existing sorting, detail panels, export, credential dialog, responsive behavior, and transition feedback.

Do not make Overview wait for result rows or Results wait for filter-choice reads. Share only the host-resolution promise and normalized page-parameter promise.

**Step 4: Add local region errors**

Catch expected query failures in each async render module, log the server detail, and render a safe retry control. Keep the module purpose-local until a second purpose needs the same behavior.

**Step 5: Replace the route page**

Make `page.tsx` match the synchronous adapter template. It may import only metadata types, the purpose parser, and `EndpointsView`; it must not import auth, Prisma, broad actions, or clients.

**Step 6: Run Endpoints and architecture tests**

Run: `bun test src/lib/endpoints src/components/endpoints src/lib/page-architecture.test.ts`

Expected: PASS, including the previously red migration guard.

**Step 7: Run lint and build checkpoint**

Run: `bunx eslint 'src/app/(app)/endpoints' src/components/endpoints src/lib/endpoints src/app/api/endpoints`

Expected: exit 0.

Run: `bun run build`

Expected: exit 0 and `/endpoints` builds successfully.

**Step 8: Commit**

```bash
git add 'src/app/(app)/endpoints' src/components/endpoints src/lib/endpoints src/lib/page-architecture.test.ts
git commit -m "refactor: stream endpoint page regions"
```

**Step 9: Request review**

Run `@superpowers:requesting-code-review` against the Endpoints slice. Resolve verified findings before adding EPGs to the migration guard.

## Task 5: Migrate EPGs as the second vertical slice

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Modify: `src/lib/epgs/query.ts`, `src/lib/epgs/query.test.ts`, `src/lib/epgs/export.ts`, `src/lib/epgs/export.test.ts`
- Create: `src/lib/epgs/params.ts`, `src/lib/epgs/params.test.ts`, `src/lib/epgs/query-data.test.ts`, `src/lib/epgs/mutation.ts`, `src/lib/epgs/mutation.test.ts`
- Create: `src/components/epgs/epgs-view.tsx`, `epg-overview.tsx`, `epg-results.tsx`, `epgs-skeleton.tsx`, `epgs-skeleton.test.tsx`, `epg-region-error.tsx`
- Move: all non-framework files from `src/app/(app)/epgs/` to `src/components/epgs/` or `src/lib/epgs/` according to render versus pure behavior
- Modify: `src/app/(app)/epgs/page.tsx`, `src/app/api/epgs/resync/route.ts`, `src/app/api/epgs/export/route.ts`, `src/lib/apic/resync-host.ts`

**Steps:**

1. Add EPGs to the migration guard and run it; expect failure.
2. Write failing parameter, deep-query, mutation/invalidation, and skeleton tests.
3. Run: `bun test src/lib/epgs src/components/epgs`; expect targeted failures.
4. Move page Prisma orchestration into authenticated eight-hour cached query functions tagged with `epgs:all` and `epgs:host:<id>`.
5. Move manual/scheduled resync orchestration and tag expiration into `mutation.ts`; reduce both route and scheduler callers to adapters.
6. Reduce export route to validation/response work over the purpose query/export interface.
7. Split the render path into shared host resolution plus independently streamed overview/filter metadata and EPG/port results.
8. Replace `page.tsx` with the synchronous typed adapter and remove old colocated files.
9. Run: `bun test src/lib/epgs src/components/epgs src/lib/page-architecture.test.ts`.
10. Run changed-file ESLint, `git diff --check`, and `bun run build`; expect exit 0.
11. Commit: `git commit -m "refactor: stream epg page regions"`.
12. Request and address a code review before continuing.

## Task 6: Migrate Interface Health

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/interface-health/query.ts`, `query.test.ts`, `params.ts`, `params.test.ts`, `mutation.ts`, `mutation.test.ts`, `export.ts`
- Move: pure `.ts` behavior and tests from `src/app/(app)/interface-health/` into `src/lib/interface-health/`
- Create/move: render modules under `src/components/interface-health/` using kebab-case
- Modify: `src/app/(app)/interface-health/page.tsx`, `src/app/api/interfaces/resync/route.ts`, `src/app/api/interfaces/export/route.ts`, `src/lib/apic/resync-host.ts`
- Replace read-only browser action usage in `src/actions/interface-samples.ts` with an authenticated query route or URL-driven server render path; delete the obsolete action after callers move

**Steps:**

1. Add Interface Health paths to the architecture guard; verify red.
2. Write failing tests for normalized filters, counter/window modes, overview counts, result rows, drawer reads, cache tags, resync invalidation, and skeletons.
3. Move existing pure behavior without changing results; run its existing tests after every move.
4. Implement authenticated cached overview/results queries with `interfaces:all` and `interfaces:host:<id>` tags.
5. Keep shared host resolution sequential; stream overview/filter metadata and table results independently.
6. Move resync/export Prisma access behind purpose modules and invalidate successful manual/scheduled writes.
7. Replace queued Server Action reads for drawer data with a secure read transport; keep mutations as Server Actions only.
8. Replace the page with the synchronous adapter; remove obsolete app-colocated files and old actions.
9. Run focused tests, changed-file ESLint, architecture guard, `git diff --check`, and build.
10. Commit: `git commit -m "refactor: stream interface health regions"`.
11. Request and address code review.

## Task 7: Migrate Nodes and hardware inventory

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/nodes/query.ts`, `query.test.ts`, `params.ts`, `params.test.ts`, `mutation.ts`, `mutation.test.ts`
- Move: `src/app/(app)/nodes/sort.ts` and test → `src/lib/nodes/`
- Move/create: all render modules under `src/components/nodes/`
- Modify: `src/app/(app)/nodes/page.tsx`, `src/app/api/nodes/resync/route.ts`, `src/lib/apic/resync-host.ts`
- Remove or narrow obsolete reads from `src/actions/nodes.ts`

**Steps:**

1. Add Nodes to the guard and verify failure.
2. Test role/view/page parsing, node/hardware summaries, result pagination, trend samples, cache tags, and invalidation.
3. Implement host resolution and independent overview/results query functions.
4. Move resync/audit/invalidation to `mutation.ts`; retain the POST route as adapter.
5. Move render and pure behavior to their purpose directories; keep dynamic chart loading in the render implementation.
6. Replace the page with the synchronous adapter.
7. Run focused tests, lint, guard, diff check, and build.
8. Commit: `git commit -m "refactor: stream node inventory regions"`.
9. Request and address code review.

## Task 8: Deepen and stream Dashboard aggregation

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/dashboard/query.ts`, `query.test.ts`
- Move: `src/app/(app)/dashboard/summary.ts` and test → `src/lib/dashboard/`
- Move/create: `src/components/dashboard/dashboard-view.tsx`, posture/metrics/attention/inventory render modules, regional skeletons and tests
- Move: `src/app/(app)/dashboard/NodesTile.tsx` → `src/components/dashboard/nodes-tile.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Delete: `src/app/(app)/dashboard/loading.tsx`, `src/app/(app)/dashboard/loading.test.tsx`

**Steps:**

1. Add Dashboard to the guard; verify red, including the forbidden `loading.tsx`.
2. Write failing interface tests for posture, metrics, attention, inventory/host freshness, safe serialization, and underlying dataset tags.
3. Move summary behavior and preserve its existing tests.
4. Implement independent cached Dashboard reads. Tag each region only with the datasets it consumes (`endpoints:all`, `interfaces:all`, `nodes:all`, and relevant host/inventory tags).
5. Build independent posture, metrics, attention, and inventory Suspense regions with matching skeletons and local errors.
6. Replace the page with a synchronous adapter and delete route-wide loading files.
7. Run focused tests, lint, guard, diff check, and build.
8. Commit: `git commit -m "refactor: stream dashboard regions"`.
9. Request and address code review.

## Task 9: Migrate legacy data pages and ingestion invalidation

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/legacy/devices/`, `endpoints/`, `health/`, and `interfaces/` purpose query/params modules and tests
- Move: applicable behavior from `src/lib/legacy-ui/` into the nearest legacy purpose; keep truly shared serialization/query primitives under `src/lib/legacy/`
- Move/create: render modules under `src/components/legacy/<purpose>/`; keep cross-legacy render modules under `src/components/legacy/`
- Modify: four `src/app/(app)/legacy/*/page.tsx` adapters
- Modify: `src/app/api/ingest/legacy/*/route.ts` and `src/lib/legacy-ingest/*`
- Replace read-only browser actions in `src/actions/legacy-health.ts` and `src/actions/legacy-interfaces.ts`; delete obsolete actions

**Steps:**

1. Add the four legacy purposes to the guard and verify red.
2. For one legacy purpose at a time, write failing query-interface, parameter, cache, invalidation, skeleton, and local-error tests.
3. Move existing pure behavior/tests before changing orchestration.
4. Implement authenticated eight-hour cached list/detail reads with purpose and entity tags.
5. Stream summary/filter metadata and result regions where independent; preserve sequential detail dependencies.
6. Invalidate legacy tags only after successful ingestion writes.
7. Replace queued Server Action reads used by drawers with authenticated read routes or URL-driven render paths.
8. Replace each page with a synchronous adapter and remove old colocated files after its focused suite passes.
9. After all four pages, run all legacy tests, guard, changed-file lint, diff check, and build.
10. Commit: `git commit -m "refactor: deepen legacy page data modules"`.
11. Request and address code review.

## Task 10: Split inventory reads, writes, and browser actions

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/inventory/devices/query.ts`, `mutation.ts`, `actions.ts`, and interface tests
- Create: `src/lib/inventory/racks/query.ts`, `mutation.ts`, `actions.ts`, and interface tests
- Create: `src/lib/inventory/sites/query.ts`, `mutation.ts`, `actions.ts`, and interface tests
- Refactor/delete: `src/actions/inventory/devices.ts`, `racks.ts`, `sites.ts`, `import.ts`
- Move/create: `src/components/inventory/devices/`, `racks/`, `import/`, with shared inventory render modules at `src/components/inventory/`
- Modify: inventory page adapters, including `devices/[id]/page.tsx`, `devices/import/page.tsx`, devices list, and racks

**Steps:**

1. Add inventory routes to the guard and verify red.
2. Write failing tests for list/detail/catalog/rack reads, CRUD/import writes, authorization, safe shapes, and device/rack/site/entity invalidation.
3. Move durable implementation into server-only mutation modules; keep only browser-callable adapters under `actions.ts`.
4. Delete old broad action files after every caller moves.
5. Cache shared inventory reads for eight hours; expire list, detail, site, and rack tags after committed writes.
6. Build synchronous page adapters and meaningful Suspense regions; preserve form and placement behavior.
7. Promote render modules only to the nearest shared inventory ancestor.
8. Run inventory tests, guard, lint, diff check, and build.
9. Commit: `git commit -m "refactor: deepen inventory page modules"`.
10. Request and address code review.

## Task 11: Migrate APIC Hosts, Scheduler, Users, History, Settings, and import-only access

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Create/refactor purpose directories: `src/lib/apic-hosts/`, `scheduler/`, `users/`, `history/`, and `settings/` as earned by reads/writes
- Split/delete: `src/actions/apic-hosts.ts`, `resync-schedules.ts`, `users.ts`, `audit.ts`
- Move/create: matching kebab-case render directories under `src/components/`
- Modify: `src/app/(app)/apic-hosts/page.tsx`, scheduler, users, history, settings, and session-only import page adapters
- Modify: `src/app/(app)/layout.tsx`

**Steps:**

1. Add each route to the guard one purpose at a time and verify red.
2. Write interface tests before splitting each broad action file.
3. Put reads in authenticated server-only `query.ts`, durable writes in `mutation.ts`, and browser mutations only in `actions.ts`.
4. Preserve Scheduler polling as an explicit uncached read while caching stable initial schedule/host shapes only where correct.
5. Move History's existing query action into `lib/history/query.ts`; preserve its current working Suspense behavior while adopting the new directory and page-adapter conventions.
6. Move optimistic route access to the shared layout, but keep secure checks in every purpose query/mutation. Remove direct `getSession` calls from page files.
7. Keep Settings/import shells synchronous; resolve needed role/user shapes in authenticated render modules.
8. Run each focused suite before deleting the old action path.
9. Run combined admin/history/auth tests, guard, lint, diff check, and build.
10. Commit: `git commit -m "refactor: deepen administrative page modules"`.
11. Request and address code review.

## Task 12: Final architecture sweep and verification

**Files:**
- Modify: `src/lib/page-architecture.test.ts`
- Modify/delete: any remaining in-scope obsolete page/action/render files identified by the guard
- Update: tests whose imports moved without behavior changes

**Step 1: Expand the architecture test to the complete approved scope**

Assert:

- no in-scope `page.tsx` imports Prisma, broad actions, or session reads;
- no in-scope render module imports Prisma;
- no migrated export/resync route imports Prisma;
- no `loading.tsx` remains for migrated pages;
- migrated route directories contain framework files only;
- excluded workflow paths remain outside the migration guard.

**Step 2: Run the guard and fix every real violation**

Run: `bun test src/lib/page-architecture.test.ts`

Expected: PASS.

**Step 3: Run the full test suite**

Run: `bun test`

Expected: all tests pass with zero failures.

**Step 4: Run lint**

Run: `bun run lint`

Expected: exit 0.

**Step 5: Run production build**

Run: `bun run build`

Expected: exit 0; all App Router routes compile.

**Step 6: Verify repository hygiene**

Run: `git diff --check`

Expected: no output.

Run: `rg -n "@/lib/prisma|@/actions/|getSession" 'src/app/(app)' --glob 'page.tsx'`

Expected: no matches in migrated scope; only explicitly excluded workflow/framework paths may remain.

Run: `find 'src/app/(app)' -name loading.tsx -print`

Expected: no migrated page loading files.

Run: `git diff --name-only 5c5aad2 -- 'src/app/(app)/bridge-domains' 'src/app/(app)/static-ports' 'src/app/(app)/interface-selectors'`

Expected: no output; excluded workflow routes remain unchanged.

**Step 7: Request final code review**

Use `@superpowers:requesting-code-review` against the design commit `5c5aad2`. Address verified Standards and Spec findings, then rerun Steps 2-6.

**Step 8: Commit final cleanup**

```bash
git add src
git commit -m "refactor: complete page data architecture migration"
```

**Step 9: Finish the branch**

Use `@superpowers:finishing-a-development-branch` only after the fresh full verification is green.
