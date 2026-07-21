# Legacy Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a route-aware ACI/Legacy brand dropdown and four real read-only Legacy infrastructure pages backed by the dedicated legacy Prisma models.

**Architecture:** Keep all Legacy pages under `/legacy/*` and leave ACI pages unchanged. Server components perform paginated initial queries, pure helpers build validated query inputs, and authenticated server actions provide bounded drawer history. Client components reuse the existing table/card/filter/drawer visual language.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Base UI/shadcn primitives, Tabler icons, Recharts, Bun test, ESLint.

## Global Constraints

- Work on the existing `feat/legacy-device-ingestion` branch.
- Dashboard, Documentation, History, Settings, Users, Logout, ACI Infrastructure, and ACI Workflows retain current routes and behavior.
- Legacy has Devices, Health, Interfaces, and Endpoints under Infrastructure and no Workflows group.
- The web app remains read-only for Legacy and never performs SSH or exposes credentials/tokens.
- Search, filtering, sorting, and pagination are server-side where supported.
- Dates cross client boundaries as ISO strings and BigInt counters as decimal strings.
- No health score or undocumented thresholds.
- Use TDD for pure navigation, query, range, sorting, and serialization behavior.

---

### Task 1: Route-aware scope state and brand dropdown

**Files:**
- Create: `src/lib/navigation-scope.ts`
- Create: `src/lib/navigation-scope.test.ts`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/components/MobileTopBar.tsx`

**Interfaces:**
- Produces: `type NavigationScope = 'aci' | 'legacy'`.
- Produces: `resolveNavigationScope(pathname: string, cookieScope?: string): NavigationScope`.
- Produces: `targetPathForScope(pathname: string, target: NavigationScope): string`.
- `AppSidebar` consumes `initialScope: NavigationScope` and writes `netroku_scope` with `SameSite=Lax`.

- [ ] **Step 1: Write failing scope and route-mapping tests**

Cover exact `/legacy` matching, ACI-only routes, cookie fallback on shared routes, ACI default, every documented route pair, shared-route stability, and unmatched fallbacks:

```ts
expect(resolveNavigationScope('/legacy/interfaces', 'aci')).toBe('legacy')
expect(resolveNavigationScope('/legacy-internal')).toBe('aci')
expect(resolveNavigationScope('/dashboard', 'legacy')).toBe('legacy')
expect(resolveNavigationScope('/nodes', 'legacy')).toBe('aci')
expect(targetPathForScope('/endpoints', 'legacy')).toBe('/legacy/endpoints')
expect(targetPathForScope('/legacy/health', 'aci')).toBe('/apic-hosts')
expect(targetPathForScope('/settings', 'legacy')).toBe('/settings')
```

- [ ] **Step 2: Run the test and confirm module-not-found failure**

Run: `bun test src/lib/navigation-scope.test.ts`

- [ ] **Step 3: Implement the pure scope helpers**

Use exact segment matching (`pathname === prefix || pathname.startsWith(prefix + '/')`), explicit mapping records, shared-path detection, and documented fallbacks.

- [ ] **Step 4: Run the scope tests**

Run: `bun test src/lib/navigation-scope.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Implement the brand dropdown and conditional navigation**

Read the cookie in the server layout:

```ts
const cookieStore = await cookies()
const initialScope = resolveNavigationScope('', cookieStore.get('netroku_scope')?.value)
```

In `AppSidebar`, derive route scope, split shared/ACI/Legacy sections, update the cookie on selection, and call `router.push(targetPathForScope(pathname, nextScope))`. Use the existing `DropdownMenuRadioGroup` primitives with an accessible `aria-label="Switch infrastructure scope"`. Display `Netroku ACI` or `Netroku Legacy` in the brand trigger. Keep admin filtering and APIC query injection only in ACI items.

Update `MobileTopBar` to show the route-derived brand label while leaving its actions unchanged.

- [ ] **Step 6: Run focused tests and lint**

Run:

```bash
bun test src/lib/navigation-scope.test.ts src/proxy.test.ts
bun run lint -- src/lib/navigation-scope.ts src/lib/navigation-scope.test.ts src/components/AppSidebar.tsx src/components/MobileTopBar.tsx 'src/app/(app)/layout.tsx'
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/navigation-scope.ts src/lib/navigation-scope.test.ts src/components/AppSidebar.tsx src/components/MobileTopBar.tsx 'src/app/(app)/layout.tsx'
git commit -m "feat: add ACI and legacy navigation scope"
```

### Task 2: Shared Legacy list and history query primitives

**Files:**
- Create: `src/lib/legacy-ui/query.ts`
- Create: `src/lib/legacy-ui/query.test.ts`
- Create: `src/lib/legacy-ui/serialize.ts`
- Create: `src/lib/legacy-ui/serialize.test.ts`
- Create: `src/components/legacy/LegacyPageShell.tsx`
- Create: `src/components/legacy/LegacyPagination.tsx`
- Create: `src/components/legacy/LegacyEmptyState.tsx`

**Interfaces:**
- Produces: `parseLegacyPage`, `parseLegacyPageSize`, `parseLegacyRange`, `legacyRangeCutoff`, `parseLegacySort`.
- Produces: `serializeLegacyCounter(value: bigint | null): string | null` and `serializeLegacyDate(value: Date | null): string | null`.
- Produces shared page chrome, empty-state, and URL pagination components.

- [ ] **Step 1: Write failing parsing and serialization tests**

```ts
expect(parseLegacyPage('-3')).toBe(1)
expect(parseLegacyPageSize('100')).toBe(100)
expect(parseLegacyPageSize('999')).toBe(50)
expect(parseLegacyRange('all')).toBe('all')
expect(serializeLegacyCounter(9007199254740993n)).toBe('9007199254740993')
```

Also cover invalid sort keys, null dates/counters, and all four range cutoffs using a fixed `now`.

- [ ] **Step 2: Run tests and confirm missing modules**

Run: `bun test src/lib/legacy-ui/query.test.ts src/lib/legacy-ui/serialize.test.ts`

- [ ] **Step 3: Implement the pure helpers and shared components**

Support page sizes `10`, `50`, `100`, and `1000`; default to `50`. Support `24h`, `7d`, `30d`, and `all`. Pagination links must preserve existing search parameters and replace only `page`.

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
bun test src/lib/legacy-ui/query.test.ts src/lib/legacy-ui/serialize.test.ts
bun run lint -- src/lib/legacy-ui src/components/legacy
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/legacy-ui src/components/legacy
git commit -m "feat: add legacy inventory UI primitives"
```

### Task 3: Legacy Devices page

**Files:**
- Create: `src/lib/legacy-ui/devices.ts`
- Create: `src/lib/legacy-ui/devices.test.ts`
- Create: `src/app/(app)/legacy/devices/page.tsx`
- Create: `src/app/(app)/legacy/devices/LegacyDevicesClient.tsx`
- Create: `src/app/(app)/legacy/devices/LegacyDeviceDrawer.tsx`

**Interfaces:**
- Produces `buildLegacyDeviceWhere({ query, sites, deviceTypes })`.
- Page emits serializable `LegacyDeviceRow` objects and summary counts.
- Client renders URL-driven search/filters/sort/page controls and row selection.

- [ ] **Step 1: Write failing device-query tests**

Verify search across site, hostname, management IP, model, serial, version, and location; multi-site/type filters; empty filters; and supported sort mappings.

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `bun test src/lib/legacy-ui/devices.test.ts`

- [ ] **Step 3: Implement device query helpers and page**

Query summary counts in parallel, then fetch one paginated device page. Render the approved columns and `Never collected` feature freshness. The drawer consumes the selected serialized row and performs no write.

- [ ] **Step 4: Run tests and lint**

Run: `bun test src/lib/legacy-ui/devices.test.ts && bun run lint -- src/lib/legacy-ui/devices.ts 'src/app/(app)/legacy/devices'`

- [ ] **Step 5: Commit**

```bash
git add src/lib/legacy-ui/devices.ts src/lib/legacy-ui/devices.test.ts 'src/app/(app)/legacy/devices'
git commit -m "feat: add legacy device inventory page"
```

### Task 4: Legacy Health page, history, and logs

**Files:**
- Create: `src/lib/legacy-ui/health.ts`
- Create: `src/lib/legacy-ui/health.test.ts`
- Create: `src/actions/legacy-health.ts`
- Create: `src/app/(app)/legacy/health/page.tsx`
- Create: `src/app/(app)/legacy/health/LegacyHealthClient.tsx`
- Create: `src/app/(app)/legacy/health/LegacyHealthDrawer.tsx`
- Create: `src/app/(app)/legacy/health/LegacyHealthTrendChart.tsx`

**Interfaces:**
- Produces `buildLegacyHealthDeviceWhere` and latest-sample row serialization.
- Produces authenticated `getLegacyHealthHistory(deviceId, options)` returning bounded chart points plus paginated samples/logs.

- [ ] **Step 1: Write failing health helper tests**

Cover latest sample selection, null preservation, status-array display state, range cutoff, deterministic ordering, and pagination option validation.

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/lib/legacy-ui/health.test.ts`

- [ ] **Step 3: Implement query helpers, authenticated action, and page UI**

The action calls `getSession()` and rejects unauthenticated access. Query chart points with an explicit maximum, return complete tables page-by-page, and never coerce null metrics to zero. The page has no Resync button.

- [ ] **Step 4: Run focused tests and lint**

Run: `bun test src/lib/legacy-ui/health.test.ts && bun run lint -- src/lib/legacy-ui/health.ts src/actions/legacy-health.ts 'src/app/(app)/legacy/health'`

- [ ] **Step 5: Commit**

```bash
git add src/lib/legacy-ui/health.ts src/lib/legacy-ui/health.test.ts src/actions/legacy-health.ts 'src/app/(app)/legacy/health'
git commit -m "feat: add legacy health history page"
```

### Task 5: Legacy Interfaces page and sample history

**Files:**
- Create: `src/lib/legacy-ui/interfaces.ts`
- Create: `src/lib/legacy-ui/interfaces.test.ts`
- Create: `src/actions/legacy-interfaces.ts`
- Create: `src/app/(app)/legacy/interfaces/page.tsx`
- Create: `src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx`
- Create: `src/app/(app)/legacy/interfaces/LegacyInterfaceDrawer.tsx`
- Create: `src/app/(app)/legacy/interfaces/LegacyInterfaceTrendChart.tsx`

**Interfaces:**
- Produces `buildLegacyInterfaceWhere`, status/presence parsing, and safe latest-sample serialization.
- Produces authenticated `getLegacyInterfaceHistory(interfaceId, options)`.

- [ ] **Step 1: Write failing interface helper tests**

Cover combined AND search/filter groups, device/site/admin/oper/presence filters, supported sort keys, current/delta counter selection, exact BigInt serialization, reset/null deltas, and history range/page options.

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts`

- [ ] **Step 3: Implement query/action/page components**

Fetch snapshots with the latest sample in a bounded relation selection. Preserve absent snapshots when requested. The drawer provides range tabs, trends, state values, and paginated history without unsafe number conversion.

- [ ] **Step 4: Run focused tests and lint**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts && bun run lint -- src/lib/legacy-ui/interfaces.ts src/actions/legacy-interfaces.ts 'src/app/(app)/legacy/interfaces'`

- [ ] **Step 5: Commit**

```bash
git add src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts src/actions/legacy-interfaces.ts 'src/app/(app)/legacy/interfaces'
git commit -m "feat: add legacy interface history page"
```

### Task 6: Legacy Endpoints lifecycle page

**Files:**
- Create: `src/lib/legacy-ui/endpoints.ts`
- Create: `src/lib/legacy-ui/endpoints.test.ts`
- Create: `src/app/(app)/legacy/endpoints/page.tsx`
- Create: `src/app/(app)/legacy/endpoints/LegacyEndpointsClient.tsx`

**Interfaces:**
- Produces `buildLegacyEndpointWhere({ query, deviceIds, sites, vlans, interfaces, statuses })`.
- Page emits paginated active/historical lifecycle rows and summary counts.

- [ ] **Step 1: Write failing endpoint query tests**

Cover active/historical/all status behavior, device/site/VLAN/interface filters, search across MAC/IP/VLAN/interface/device fields, and deterministic supported sort mappings.

- [ ] **Step 2: Run the test and confirm failure**

Run: `bun test src/lib/legacy-ui/endpoints.test.ts`

- [ ] **Step 3: Implement endpoint helper and page**

Query active/historical counts and filter options in parallel, render nullable IP distinctly, and display placement history exactly as stored. Include responsive mobile rows and collector-specific empty guidance.

- [ ] **Step 4: Run focused tests and lint**

Run: `bun test src/lib/legacy-ui/endpoints.test.ts && bun run lint -- src/lib/legacy-ui/endpoints.ts 'src/app/(app)/legacy/endpoints'`

- [ ] **Step 5: Commit**

```bash
git add src/lib/legacy-ui/endpoints.ts src/lib/legacy-ui/endpoints.test.ts 'src/app/(app)/legacy/endpoints'
git commit -m "feat: add legacy endpoint lifecycle page"
```

### Task 7: Integration, responsive polish, and verification

**Files:**
- Modify only files from Tasks 1-6 when verification reveals scoped issues.
- Inspect: `.gitignore` to confirm the existing `/.superpowers` exclusion remains present.

**Interfaces:**
- Verifies all acceptance criteria without adding new feature scope.

- [ ] **Step 1: Run the complete automated verification matrix**

```bash
bun test
bun run lint -- src/lib/navigation-scope.ts src/lib/navigation-scope.test.ts src/lib/legacy-ui src/components/legacy src/components/AppSidebar.tsx src/components/MobileTopBar.tsx 'src/app/(app)/legacy' src/actions/legacy-health.ts src/actions/legacy-interfaces.ts
bunx prisma validate
bun run build
git diff --check
```

Expected: every command exits 0. Repository-wide lint remains separately subject to the already documented generated `.source` baseline.

- [ ] **Step 2: Verify with the in-app browser**

Use the authenticated local application and check:

- Brand dropdown in collapsed/expanded sidebar and keyboard selection.
- Shared-route scope retention after reload.
- Every documented cross-navigation mapping/fallback.
- All four Legacy pages with current seeded data and empty filters.
- Search, filters, sorting, pagination, range changes, drawer loading/errors.
- Desktop and mobile widths in light and dark themes.
- ACI navigation and pages remain unchanged.

- [ ] **Step 3: Run final Git and test checks after browser-driven fixes**

Run: `bun test && bun run build && git diff --check && git status --short --branch`

- [ ] **Step 4: Commit any final scoped polish**

```bash
git add src/lib/navigation-scope.ts src/lib/legacy-ui src/components/legacy \
  src/components/AppSidebar.tsx src/components/MobileTopBar.tsx \
  'src/app/(app)/layout.tsx' 'src/app/(app)/legacy' \
  src/actions/legacy-health.ts src/actions/legacy-interfaces.ts
git commit -m "fix: polish legacy infrastructure views"
```
