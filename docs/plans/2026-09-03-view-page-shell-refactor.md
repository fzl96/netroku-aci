# View Page Shell Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor all 17 remaining `*View` routes to use the `/epgs` server-shell architecture without page-wide client wrappers or fetch-and-forward Server Components.

**Architecture:** Each route renders a synchronous Server Component shell that owns static layout and starts stable data promises. Interactive regions consume those promises with React `use()` inside independent Suspense boundaries, while meaningful server gates for redirects, `notFound()`, authentication, and substantial server rendering remain server-side. URL parameters remain the source of truth and each focused Client Component owns its own `useTransition`/router interaction instead of sharing navigation through context.

**Tech Stack:** Next.js App Router, React 19 Server and Client Components, React `use()` and Suspense, TypeScript, Bun test, ESLint, Prettier.

---

## Verification and review record — 2026-09-05

Tasks 1–11 were already committed when work resumed at `4acc4d4`. Task 12 automated
verification and Task 13 code review are now complete on `fix/page-shell-review`.
Integration remains pending; no merge or push was performed.

The independent review compared `294b243..4acc4d4` against this plan and the design.
It found two behavior regressions, both repaired and re-reviewed:

- Endpoints, Nodes, and Interface Health awaited host resolution outside their
  regional Suspense boundaries. Their static headings could not stream until the
  host read completed. The server gates now sit inside the overview/controls
  boundaries, while results and trends mount independently. Endpoint and node
  results retain nested, view-specific skeletons after the host resolves. The
  conditional CRC region retains its own boundary.
- Endpoint overview loading awaited results and inherited results failures. The
  overview now loads independently; only the header payload combines overview and
  the shared results promise for export totals.

The additional nested boundaries intentionally refine the original exact boundary
counts without adding a whole-body fallback. Server authorization, redirect,
empty-state, and substantial server rendering responsibilities are preserved.

Verification repairs also replaced the EPG suite's process-wide APIC-host query
mock with a restored spy, resolving the four APIC-host test failures reported by
the previous verification commit. Eight plan/spec documents added during the
migration were formatted so the repository-wide formatting check passes.

Validation:

- Focused architecture/component checks plus streaming regressions: **123 pass**.
- Full `bun test`: **868 pass, 2 skip, 0 fail** across 140 files. The two skips are
  the existing PostgreSQL locking integration cases.
- Fourteen executable streaming cases use real shells and React rendering with
  deferred params, hosts, and data. They cover isolated loading, view-specific
  fallbacks, no-host/auth/redirect gates, CRC visibility, and endpoint result
  failure isolation. The initial thirteen cases all failed against the original
  shells, then passed with the repairs. Query/client stand-ins run in subprocesses
  to avoid leaking module mocks into other suites.
- `npm run format:check`: pass. `npm run lint`: zero errors and four existing
  unused-variable warnings. `npm run build`: pass.
- The installed local code-review-graph CLI refreshed the graph and inspected
  changes against `294b243`; graph MCP tools were unavailable in this session.
  The graph reported no affected stored flows. Coverage links are incomplete, so
  source comparisons and executable tests supplemented graph inspection.
- Production HTTP smoke checks: `/endpoints`, `/interface-health`,
  `/inventory/devices`, and `/legacy/interfaces` each returned `307 /signin`;
  `/signin` returned `200`. The temporary server was stopped after verification.
  Authenticated browser checks for filters, pagination, resync, and animations
  remain unverified because browser tooling and a signed-in session were not
  available. Existing interaction implementations were reviewed against the base.

---

### Task 1: Extend the architecture guard for shell-based routes

**Files:**

- Modify: `src/lib/page-architecture.test.ts`
- Create: `src/lib/page-shell-architecture.test.ts`

**Step 1: Write the failing architecture tests**

Add a table covering all 17 route/component pairs. Assert that every route imports its `*-shell` module, no listed `*-view.tsx` exists, and no known page-wide client wrapper export remains:

```ts
const VIEW_SHELL_ROUTES = [
  ['src/app/(app)/dashboard/page.tsx', 'src/components/dashboard/dashboard-shell.tsx'],
  ['src/app/(app)/endpoints/page.tsx', 'src/components/endpoints/endpoints-shell.tsx'],
  ['src/app/(app)/nodes/page.tsx', 'src/components/nodes/nodes-shell.tsx'],
  ['src/app/(app)/history/page.tsx', 'src/components/history/history-shell.tsx'],
  ['src/app/(app)/interface-health/page.tsx', 'src/components/interface-health/interface-health-shell.tsx'],
  ['src/app/(app)/apic-hosts/page.tsx', 'src/components/apic-hosts/apic-hosts-shell.tsx'],
  ['src/app/(app)/scheduler/page.tsx', 'src/components/scheduler/scheduler-shell.tsx'],
  ['src/app/(app)/settings/page.tsx', 'src/components/settings/settings-shell.tsx'],
  ['src/app/(app)/users/page.tsx', 'src/components/users/users-shell.tsx'],
  ['src/app/(app)/inventory/devices/page.tsx', 'src/components/inventory/devices/devices-shell.tsx'],
  ['src/app/(app)/inventory/devices/[id]/page.tsx', 'src/components/inventory/devices/device-detail-shell.tsx'],
  ['src/app/(app)/inventory/devices/import/page.tsx', 'src/components/inventory/devices/device-import-shell.tsx'],
  ['src/app/(app)/inventory/racks/page.tsx', 'src/components/inventory/racks/racks-shell.tsx'],
  ['src/app/(app)/legacy/devices/page.tsx', 'src/components/legacy/devices/devices-shell.tsx'],
  ['src/app/(app)/legacy/endpoints/page.tsx', 'src/components/legacy/endpoints/endpoints-shell.tsx'],
  ['src/app/(app)/legacy/health/page.tsx', 'src/components/legacy/health/health-shell.tsx'],
  ['src/app/(app)/legacy/interfaces/page.tsx', 'src/components/legacy/interfaces/interfaces-shell.tsx'],
] as const
```

Add the 17 old view paths to the appropriate `MIGRATED_PURPOSES[].obsoletePaths` arrays. In the new test, also assert that `EndpointsClient`, `NodesClient`, `InterfaceHealthFrame`, and `LegacyInterfacesFrame` are absent from their former client modules.

**Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/page-architecture.test.ts src/lib/page-shell-architecture.test.ts`

Expected: FAIL because routes still import `*View`, shell files do not exist, and wrappers remain.

**Step 3: Commit the red tests**

```bash
git add src/lib/page-architecture.test.ts src/lib/page-shell-architecture.test.ts
git commit -m "test: define shell architecture for migrated pages"
```

### Task 2: Refactor `/endpoints` into a server shell and focused promise consumers

**Files:**

- Create: `src/components/endpoints/endpoints-shell.tsx`
- Modify: `src/components/endpoints/endpoint-header-actions.tsx`
- Modify: `src/components/endpoints/endpoint-overview.tsx`
- Modify: `src/components/endpoints/endpoint-results.tsx`
- Modify: `src/components/endpoints/endpoints-skeleton.test.tsx`
- Modify: `src/lib/endpoints/query.ts`
- Modify: `src/app/(app)/endpoints/page.tsx`
- Delete: `src/components/endpoints/endpoints-view.tsx`
- Delete: `src/components/endpoints/endpoints-client.tsx`

**Step 1: Strengthen the failing endpoint composition test**

Update the source assertions to require `EndpointsShell`, three independent Suspense boundaries, shell-owned `pagePromise`/`overviewPromise`/`resultsPromise`, client-side `use(dataPromise)` in each interactive region, and absence of the old view/client files. Assert that no Suspense wraps the shell's entire `<main>`.

**Step 2: Run the endpoint test to verify it fails**

Run: `bun test src/components/endpoints/endpoints-skeleton.test.tsx`

Expected: FAIL on missing `endpoints-shell.tsx` and promise consumers.

**Step 3: Add serializable endpoint load states**

Export discriminated load-state and payload types from `src/lib/endpoints/query.ts`, following the EPG equivalents:

```ts
export type EndpointLoadState<T> =
  | { kind: 'ready'; data: T }
  | { kind: 'inactive' }
  | { kind: 'unauthorized' }

export type EndpointOverviewPayload = {
  params: EndpointPageParams
  hosts: EndpointHostOption[]
  overview: EndpointOverviewData
  filteredTotal: number
}

export type EndpointResultsPayload = {
  params: EndpointPageParams
  results: EndpointResultsData
}
```

**Step 4: Implement the shell-owned promise graph**

Build `EndpointsShell` like `EpgShell`: resolve params and host once; map redirect, empty, and expected read errors in a server `EndpointBody`; start overview and results loading immediately; share the results promise with header totals where needed. Render static title/layout in the shell and keep header actions, overview/filter tools, and results under separate skeletons.

**Step 5: Fold the client implementations into their region files**

Make the three region files Client Components. Move the corresponding implementation sections and private helpers from `endpoints-client.tsx`, call `use(dataPromise)`, and handle `ready`/`inactive`/`unauthorized`. Replace `EndpointNavigationContext` with local `useRouter()` and `useTransition()` in each region. Preserve `router.replace(..., { scroll: false })`, `router.refresh()` after resync, selection/detail state, export, pagination, responsive cards, and row stagger classes.

**Step 6: Route directly to the shell and delete wrappers**

Update the route import/render to `EndpointsShell`, then delete the old view and aggregate client module.

**Step 7: Run focused tests and commit**

Run: `bun test src/components/endpoints/endpoints-skeleton.test.tsx src/lib/endpoints`

Expected: PASS.

```bash
git add src/app/'(app)'/endpoints/page.tsx src/components/endpoints src/lib/endpoints
git commit -m "refactor: move endpoints to promise-consuming regions"
```

### Task 3: Refactor `/nodes` without shared navigation context

**Files:**

- Create: `src/components/nodes/nodes-shell.tsx`
- Modify: `src/components/nodes/node-header-actions.tsx`
- Modify: `src/components/nodes/node-overview.tsx`
- Modify: `src/components/nodes/node-trend.tsx`
- Modify: `src/components/nodes/node-results.tsx`
- Modify: `src/components/nodes/nodes-skeleton.test.tsx`
- Modify: `src/lib/nodes/query.ts`
- Modify: `src/app/(app)/nodes/page.tsx`
- Delete: `src/components/nodes/nodes-view.tsx`
- Delete: `src/components/nodes/nodes-client.tsx`

**Step 1: Write failing node-shell assertions**

Assert that the shell owns host, overview, trend, and results promises; exposes four independent Suspense regions; each focused interactive region calls `use(dataPromise)`; and the old view/client wrapper files are absent.

**Step 2: Run the node test to verify it fails**

Run: `bun test src/components/nodes/nodes-skeleton.test.tsx`

Expected: FAIL on the shell and wrapper-removal assertions.

**Step 3: Add node load-state payload types and shell composition**

Add serializable `NodeLoadState<T>` payload types in `src/lib/nodes/query.ts`. Implement `NodesShell` with one page-context promise and independent overview/trend/results promises. Retain server-owned redirect/no-host/authorization handling and the view-specific result skeleton fallback.

**Step 4: Move interactive implementations into focused files**

Move header actions, overview, trend, and table/results sections out of `nodes-client.tsx`. Each Client Component calls `use(dataPromise)` and owns only the transition state it uses. Preserve resync refresh, host changes, tabs/search/filter changes, dynamic trend chart loading, pagination, responsive rows, and animations.

**Step 5: Update route, remove old files, test, and commit**

Run: `bun test src/components/nodes/nodes-skeleton.test.tsx src/lib/nodes`

Expected: PASS.

```bash
git add src/app/'(app)'/nodes/page.tsx src/components/nodes src/lib/nodes
git commit -m "refactor: move nodes to promise-consuming regions"
```

### Task 4: Refactor `/interface-health` and remove its page-wide frame

**Files:**

- Create: `src/components/interface-health/interface-health-shell.tsx`
- Create: `src/components/interface-health/interface-status-badge.tsx`
- Create: `src/components/interface-health/interface-health-shell.test.tsx`
- Modify: `src/components/interface-health/interface-header-actions.tsx`
- Modify: `src/components/interface-health/interface-controls.tsx`
- Modify: `src/components/interface-health/interface-node-filter.tsx`
- Modify: `src/components/interface-health/interface-summary.tsx`
- Modify: `src/components/interface-health/interface-crc-trend.tsx`
- Modify: `src/components/interface-health/interface-sync-status.tsx`
- Modify: `src/components/interface-health/interface-results.tsx`
- Modify: `src/components/interface-health/interface-error-trend-drawer.tsx`
- Modify: `src/lib/interface-health/query.ts`
- Modify: `src/app/(app)/interface-health/page.tsx`
- Delete: `src/components/interface-health/interface-health-view.tsx`
- Delete: `src/components/interface-health/interface-health-client.tsx`

**Step 1: Write the failing interface shell test**

Assert that the shell renders static title/description, starts host/overview/CRC/results promises once, keeps regional Suspense fallbacks, and does not use `InterfaceHealthFrame` or a navigation context. Assert that client regions consume stable promises with `use()`.

**Step 2: Run it to verify failure**

Run: `bun test src/components/interface-health/interface-health-shell.test.tsx`

Expected: FAIL because the shell and focused clients do not exist yet.

**Step 3: Implement page context and data states**

Move the existing promise graph into `InterfaceHealthShell`. Add discriminated serializable states/payloads in `src/lib/interface-health/query.ts`; keep server handling for redirect, no-host, and expected read errors. Preserve the conditional CRC skeleton without introducing a whole-body Suspense fallback.

**Step 4: Split the aggregate client by region**

Move each exported UI section and its private helpers into its existing focused file. Put `OperStBadge` in `interface-status-badge.tsx` so both results and the error drawer can import it without recreating a page-wide client module. Each navigation-capable component owns local router/transition state. Preserve host selection, resync/export, filters, summary, CRC chart, sorting, drawer requests, pagination, cards, and row animation.

**Step 5: Update route, test, and commit**

Run: `bun test src/components/interface-health src/lib/interface-health`

Expected: PASS.

```bash
git add src/app/'(app)'/interface-health/page.tsx src/components/interface-health src/lib/interface-health
git commit -m "refactor: split interface health into streamed regions"
```

### Task 5: Simplify `/history` fetch-and-forward regions

**Files:**

- Create: `src/components/history/history-shell.tsx`
- Create: `src/components/history/history-shell.test.tsx`
- Modify: `src/components/history/history-controls.tsx`
- Modify: `src/components/history/history-results.tsx`
- Modify: `src/lib/history/query.ts`
- Modify: `src/app/(app)/history/page.tsx`
- Delete: `src/components/history/history-view.tsx`
- Delete: `src/components/history/history-controls-client.tsx`
- Delete: `src/components/history/history-results-client.tsx`

**Step 1: Write a failing history architecture test**

Assert two independent Suspense regions, shell-owned results loading, `use(paramsPromise)` in controls, `use(dataPromise)` in results, and deletion of both forwarding client files.

**Step 2: Run it to verify failure**

Run: `bun test src/components/history/history-shell.test.tsx`

Expected: FAIL.

**Step 3: Implement focused clients and shell**

Move `HistoryControlsClient` into `history-controls.tsx` and consume the parsed params promise. Move `HistoryResultsClient` into `history-results.tsx`, consume a shell-created `HistoryLoadState` promise, and preserve expected-error UI, URL replacement, pagination, and row rendering. Keep title and description server-rendered.

**Step 4: Update route, test, and commit**

Run: `bun test src/components/history src/lib/history`

Expected: PASS.

```bash
git add src/app/'(app)'/history/page.tsx src/components/history src/lib/history
git commit -m "refactor: simplify history streaming regions"
```

### Task 6: Rename the already-correct dashboard composition to a shell

**Files:**

- Create: `src/components/dashboard/dashboard-shell.tsx`
- Modify: `src/components/dashboard/dashboard-skeleton.test.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`
- Delete: `src/components/dashboard/dashboard-view.tsx`

**Step 1: Update the test to require `DashboardShell`**

Keep the existing assertions for five independent Suspense regions and one invocation per shared dashboard query. Add an assertion that dashboard data presenters remain Server Components and do not gain `'use client'` merely for uniformity.

**Step 2: Run it to verify failure**

Run: `bun test src/components/dashboard/dashboard-skeleton.test.tsx`

Expected: FAIL because the route still uses `DashboardView`.

**Step 3: Rename composition and update imports**

Move the current composition unchanged to `DashboardShell`. Keep `DashboardMetrics`, `DashboardPosture`, `DashboardAttention`, `DashboardInventory`, and `DashboardStatus` as meaningful server-rendering regions because they do not need client interactivity.

**Step 4: Test and commit**

Run: `bun test src/components/dashboard`

Expected: PASS.

```bash
git add src/app/'(app)'/dashboard/page.tsx src/components/dashboard
git commit -m "refactor: rename dashboard composition as shell"
```

### Task 7: Rename admin and account views while preserving server authorization gates

**Files:**

- Create: `src/components/apic-hosts/apic-hosts-shell.tsx`
- Create: `src/components/scheduler/scheduler-shell.tsx`
- Create: `src/components/users/users-shell.tsx`
- Create: `src/components/settings/settings-shell.tsx`
- Create: `src/components/apic-hosts/apic-hosts-shell.test.tsx`
- Create: `src/components/scheduler/scheduler-shell.test.tsx`
- Create: `src/components/users/users-shell.test.tsx`
- Modify: `src/components/settings/settings-streaming.test.tsx`
- Modify: `src/app/(app)/apic-hosts/page.tsx`
- Modify: `src/app/(app)/scheduler/page.tsx`
- Modify: `src/app/(app)/users/page.tsx`
- Modify: `src/app/(app)/settings/page.tsx`
- Delete: `src/components/apic-hosts/apic-hosts-view.tsx`
- Delete: `src/components/scheduler/scheduler-view.tsx`
- Delete: `src/components/users/users-view.tsx`
- Delete: `src/components/settings/settings-view.tsx`

**Step 1: Write failing shell/gate tests**

Assert that each route renders a named shell and static heading before its Suspense region. Also assert that `ApicHostsResults`, `SchedulerResults`, and `UsersResults` retain `requireSession()`, redirect, `notFound()`, and expected read-error handling, while settings retains its session redirect gate.

**Step 2: Run tests to verify failure**

Run: `bun test src/components/apic-hosts src/components/scheduler src/components/users src/components/settings`

Expected: FAIL on missing shell files/names.

**Step 3: Rename only the true composition modules**

Create `ApicHostsShell`, `SchedulerShell`, `UsersShell`, and `SettingsShell` from their existing view composition. Keep the server result/content components because they are not shallow fetch adapters: they own authorization, redirect/404 behavior, and error mapping. Keep the deep mutation-heavy client modules intact.

**Step 4: Update routes, test, and commit**

Run: `bun test src/components/apic-hosts src/components/scheduler src/components/users src/components/settings src/lib/page-shell-architecture.test.ts`

Expected: PASS for these routes.

```bash
git add src/app/'(app)'/{apic-hosts,scheduler,users,settings}/page.tsx src/components/{apic-hosts,scheduler,users,settings}
git commit -m "refactor: expose admin pages through server shells"
```

### Task 8: Refactor inventory list and rack results to consume promises

**Files:**

- Create: `src/components/inventory/devices/devices-shell.tsx`
- Create: `src/components/inventory/devices/devices-shell.test.tsx`
- Modify: `src/components/inventory/devices/devices-results.tsx`
- Create: `src/components/inventory/racks/racks-shell.tsx`
- Create: `src/components/inventory/racks/racks-shell.test.tsx`
- Modify: `src/components/inventory/racks/racks-results.tsx`
- Modify: `src/app/(app)/inventory/devices/page.tsx`
- Modify: `src/app/(app)/inventory/racks/page.tsx`
- Delete: `src/components/inventory/devices/devices-view.tsx`
- Delete: `src/components/inventory/devices/devices-table-client.tsx`
- Delete: `src/components/inventory/racks/racks-view.tsx`
- Delete: `src/components/inventory/racks/racks-table-client.tsx`

**Step 1: Write failing inventory shell tests**

Require shell-created serializable result promises, `use(dataPromise)` in the mutation-capable results modules, region-local errors, and absence of the fetch-and-forward/table-client pairs.

**Step 2: Run tests to verify failure**

Run: `bun test src/components/inventory/devices/devices-shell.test.tsx src/components/inventory/racks/racks-shell.test.tsx`

Expected: FAIL.

**Step 3: Implement device results loading and merge its client**

Start role, paged devices, and stacks concurrently in `DevicesShell`, map `InventoryReadError` to a serializable state, and pass the promise to `DevicesResults`. Make `devices-results.tsx` the Client Component and move the existing table/dialog/pagination implementation into it unchanged.

**Step 4: Implement rack loading and merge its client**

Start role/sites/devices together in `RacksShell`; after sites resolve, select the requested/default site and load its racks. Pass one serializable promise to `RacksResults`, which absorbs the existing rack interaction implementation. Preserve optimistic rack/device edits, drag-and-drop, site selection, and permissions.

**Step 5: Update routes, test, and commit**

Run: `bun test src/components/inventory src/lib/inventory`

Expected: PASS.

```bash
git add src/app/'(app)'/inventory/{devices,racks} src/components/inventory/{devices,racks}
git commit -m "refactor: stream inventory data into focused clients"
```

### Task 9: Rename inventory detail and import compositions without weakening server gates

**Files:**

- Create: `src/components/inventory/devices/device-detail-shell.tsx`
- Create: `src/components/inventory/devices/device-import-shell.tsx`
- Modify: `src/components/inventory/devices/device-import-streaming.test.tsx`
- Modify: `src/app/(app)/inventory/devices/[id]/page.tsx`
- Modify: `src/app/(app)/inventory/devices/import/page.tsx`
- Delete: `src/components/inventory/devices/device-detail-view.tsx`
- Delete: `src/components/inventory/devices/device-import-view.tsx`

**Step 1: Update failing shell tests**

Assert the import shell renders static instructions before `DeviceImportContent`, retains the role-based redirects, and keeps its Suspense fallback. Assert `DeviceDetailShell` retains server-side read-error redirect and `notFound()` behavior.

**Step 2: Run tests to verify failure**

Run: `bun test src/components/inventory/devices/device-import-streaming.test.tsx src/lib/page-shell-architecture.test.ts`

Expected: FAIL on old names/paths.

**Step 3: Rename the meaningful server modules and routes**

Move each implementation without turning it into a Client Component. The detail renderer remains a substantial async Server Component; import retains its async role gate around the deep `DeviceImportClient`.

**Step 4: Test and commit**

Run: `bun test src/components/inventory src/lib/inventory`

Expected: PASS.

```bash
git add src/app/'(app)'/inventory/devices src/components/inventory/devices
git commit -m "refactor: rename inventory detail and import shells"
```

### Task 10: Refactor legacy devices, endpoints, and health regions

**Files:**

- Create: `src/components/legacy/devices/devices-shell.tsx`
- Modify: `src/components/legacy/devices/device-filters.tsx`
- Modify: `src/components/legacy/devices/device-results.tsx`
- Delete: `src/components/legacy/devices/devices-view.tsx`
- Delete: `src/components/legacy/devices/devices-client.tsx`
- Create: `src/components/legacy/endpoints/endpoints-shell.tsx`
- Modify: `src/components/legacy/endpoints/endpoint-filters.tsx`
- Modify: `src/components/legacy/endpoints/endpoint-results.tsx`
- Modify: `src/components/legacy/endpoints/endpoints-client.test.tsx`
- Delete: `src/components/legacy/endpoints/endpoints-view.tsx`
- Delete: `src/components/legacy/endpoints/endpoints-client.tsx`
- Create: `src/components/legacy/health/health-shell.tsx`
- Modify: `src/components/legacy/health/health-filters.tsx`
- Modify: `src/components/legacy/health/health-results.tsx`
- Delete: `src/components/legacy/health/health-view.tsx`
- Delete: `src/components/legacy/health/health-client.tsx`
- Modify: `src/app/(app)/legacy/devices/page.tsx`
- Modify: `src/app/(app)/legacy/endpoints/page.tsx`
- Modify: `src/app/(app)/legacy/health/page.tsx`
- Create: `src/components/legacy/legacy-shell-architecture.test.tsx`

**Step 1: Write failing legacy shell tests**

For each route assert three independent summary/filter/results boundaries, shell-started promises, Client Component `use()` in filters/results, and no old view/client aggregate. Keep shared `LegacyPageShell` and `LegacyPagination` because they are reused deep modules rather than forwarding adapters.

**Step 2: Run tests to verify failure**

Run: `bun test src/components/legacy/legacy-shell-architecture.test.tsx`

Expected: FAIL.

**Step 3: Implement each shell and promise consumer**

For each domain, start summary, filter-option, and result work from the shell. Keep summary as a Server Component that awaits its promise because it renders meaningful server markup and has no interaction. Fold filter/results client implementations into their focused files, consume serializable load states with `use()`, and preserve error states, drawer state, filters, sorting, pagination, mobile cards, and row animation.

**Step 4: Relocate the `LegacyMac` unit-test import**

Keep `LegacyMac` exported from `endpoint-results.tsx` (or a smaller existing endpoint presentation module) and update its test import; do not retain `endpoints-client.tsx` solely for that helper.

**Step 5: Update routes, test, and commit**

Run: `bun test src/components/legacy src/lib/legacy`

Expected: PASS.

```bash
git add src/app/'(app)'/legacy src/components/legacy src/lib/legacy
git commit -m "refactor: move legacy lists to promise-consuming regions"
```

### Task 11: Refactor legacy interfaces and remove its navigation provider

**Files:**

- Create: `src/components/legacy/interfaces/interfaces-shell.tsx`
- Modify: `src/components/legacy/interfaces/interface-filters.tsx`
- Modify: `src/components/legacy/interfaces/interface-results.tsx`
- Delete: `src/components/legacy/interfaces/interfaces-view.tsx`
- Delete: `src/components/legacy/interfaces/interfaces-client.tsx`
- Modify: `src/app/(app)/legacy/interfaces/page.tsx`
- Modify: `src/components/legacy/legacy-shell-architecture.test.tsx`

**Step 1: Extend the failing legacy test**

Require `LegacyInterfacesShell` to render `LegacyPageShell` directly, start summary/filter/results promises, and omit `LegacyInterfacesFrame`, `NavigationContext`, and `useLegacyInterfaceNavigation`.

**Step 2: Run it to verify failure**

Run: `bun test src/components/legacy/legacy-shell-architecture.test.tsx`

Expected: FAIL on interface-specific assertions.

**Step 3: Implement focused interface regions**

Keep the pure summary renderer server-side with an explicit promise. Fold filters/results into their focused Client Component files and give each local `useRouter()`/`useTransition()` navigation. Preserve view tabs, search, device/site/state filters, sorting, exact counters, drawer history requests, pagination, and responsive rendering.

**Step 4: Update route, test, and commit**

Run: `bun test src/components/legacy src/lib/legacy/interfaces`

Expected: PASS.

```bash
git add src/app/'(app)'/legacy/interfaces/page.tsx src/components/legacy/interfaces src/components/legacy/legacy-shell-architecture.test.tsx
git commit -m "refactor: remove legacy interface navigation frame"
```

### Task 12: Run architecture and regression verification

**Files:**

- Modify as needed: tests and modules changed in Tasks 1–11

**Step 1: Update the code graph and inspect affected flows**

Run the code-review-graph incremental update, then use change detection and affected-flow inspection against the design commit. Resolve stale imports, unexpected dependents, and test gaps before declaring completion.

**Step 2: Run focused architecture tests**

Run:

```bash
bun test src/lib/page-architecture.test.ts src/lib/page-shell-architecture.test.ts \
  src/components/endpoints src/components/nodes src/components/dashboard \
  src/components/history src/components/interface-health src/components/apic-hosts \
  src/components/scheduler src/components/settings src/components/users \
  src/components/inventory src/components/legacy
```

Expected: PASS with no obsolete views or whole-page client providers.

**Step 3: Run formatting and lint checks**

Run: `npm run format:check && npm run lint`

Expected: formatting passes and ESLint reports no new errors.

**Step 4: Run the complete test suite**

Run: `bun test`

Expected: all tests pass; only the two existing PostgreSQL locking tests remain skipped.

**Step 5: Run the production build**

Run: `npm run build`

Expected: Next.js production build succeeds with no server/client boundary or promise-serialization error.

**Step 6: Smoke-test representative pages**

When the local app and authentication data are available, inspect `/endpoints`, `/interface-health`, `/inventory/devices`, and `/legacy/interfaces`. Verify static shells paint immediately, region skeletons are isolated, URL filters and pagination work, resync refreshes data, redirects/404s remain correct, and table rows retain their stagger animation.

**Step 7: Commit final repairs**

```bash
git add src docs/plans/2026-09-03-view-page-shell-refactor.md
git commit -m "test: verify page shell refactor"
```

### Task 13: Review and integrate the branch

**Step 1: Request code review**

Use `superpowers:requesting-code-review` and review changes against `294b243`, checking both the approved design and repository standards.

**Step 2: Address findings with verification**

Apply only verified fixes, rerun their focused tests, then repeat the full verification commands when behavior changed.

**Step 3: Finish the development branch**

Use `superpowers:finishing-a-development-branch` to offer merge/PR/keep/discard choices. Do not merge until the user requests integration.
