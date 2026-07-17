# Review Validation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce large-CSV Review latency with request-scoped APIC read deduplication, managed-object grouping, HTTPS keep-alive, and bounded Review DOM rendering.

**Architecture:** A new request-scoped reader owns exact-path GET promises and exposes single and grouped reads. Static-port, bridge-domain, and EPG validators use one reader per Review request and organize shared/target reads by unique APIC path while retaining original row results. The Review UI paginates the main table and lazily mounted issue list without changing the complete actionable-row set.

**Tech Stack:** TypeScript, Bun test, Node HTTPS, Next.js 16, React 19, Tailwind CSS.

## Global Constraints

- Validation concurrency remains 10.
- Interface-selector validation logic is not refactored.
- POST requests and deploy/rollback write behavior are unchanged and never cached.
- APIC read state is never shared between HTTP Review requests.
- Review and issue pages contain 100 rows each.

---

### Task 1: Request-scoped APIC reader and HTTPS keep-alive

**Files:**
- Create: `src/lib/apic/read-cache.ts`
- Create: `src/lib/apic/read-cache.test.ts`
- Create: `src/lib/apic/client.test.ts`
- Modify: `src/lib/apic/client.ts:1-56`

**Interfaces:**
- Produces: `ApicGetResult<T>`, `ApicReader`, and `createApicReader(host, token, fetcher?)`.
- Produces: `apicAgent`, the bounded keep-alive HTTPS agent used by `apicFetch`.

- [ ] **Step 1: Write failing cache tests**

Add tests that call the desired reader API with an injected fetcher and assert concurrent identical paths call the fetcher once, different paths call independently, a rejected fetch is evicted and retried, separate readers do not share state, and `getMany` preserves unique paths.

```ts
const reader = createApicReader('apic.local', 'token', async (_host, path) => {
  calls.push(path)
  return Response.json({ imdata: [{ path }] })
})
const [first, second] = await Promise.all([reader.get('/same'), reader.get('/same')])
expect(calls).toEqual(['/same'])
expect(first).toEqual(second)
```

- [ ] **Step 2: Run cache tests and verify RED**

Run: `bun test src/lib/apic/read-cache.test.ts`
Expected: FAIL because `read-cache.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal request-scoped reader**

Implement a per-instance `Map<string, Promise<ApicGetResult<unknown>>>`. Store the promise before awaiting, parse successful JSON once, retain HTTP failures, remove network/parse failures from the map, and return a status-zero error result to current callers. Implement `getMany` with exact-path deduplication and `runParallel(..., 10, ...)`.

```ts
export type ApicGetResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string }

export interface ApicReader {
  get<T>(path: string): Promise<ApicGetResult<T>>
  getMany<T>(paths: Iterable<string>): Promise<Map<string, ApicGetResult<T>>>
}
```

- [ ] **Step 4: Run cache tests and verify GREEN**

Run: `bun test src/lib/apic/read-cache.test.ts`
Expected: PASS with all reader behaviors verified.

- [ ] **Step 5: Write the failing keep-alive test**

Assert `apicAgent.keepAlive`, `maxSockets`, `maxFreeSockets`, and agent options match the approved design.

- [ ] **Step 6: Run the client test and verify RED**

Run: `bun test src/lib/apic/client.test.ts`
Expected: FAIL because the existing private agent does not enable keep-alive and is not exported.

- [ ] **Step 7: Configure and export the bounded keep-alive agent**

Use `keepAlive: true`, `keepAliveMsecs: 1_000`, `maxSockets: 20`, `maxFreeSockets: 10`, and `scheduling: 'lifo'`, retaining `rejectUnauthorized: false`.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `bun test src/lib/apic/read-cache.test.ts src/lib/apic/client.test.ts`
Expected: PASS.

Commit: `perf(apic): reuse connections and deduplicate review reads`

### Task 2: Static-port validation grouping

**Files:**
- Create: `src/lib/apic/apic.test.ts`
- Modify: `src/lib/apic/apic.ts:1-81,143-166`

**Interfaces:**
- Consumes: `ApicReader` and `createApicReader` from Task 1.
- Preserves: public validation signatures, adding only an optional reader argument for direct testing.

- [ ] **Step 1: Write failing validator call-count tests**

Use two valid rows sharing EPG, nodes, and IPG but with distinct VLAN/binding paths. Inject a reader backed by a path-aware fake APIC fetcher. Assert ordered statuses are unchanged and shared paths are fetched once. Add a rollback case proving identical target reads deduplicate.

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test src/lib/apic/apic.test.ts`
Expected: FAIL because validators do not accept/use the request-scoped reader.

- [ ] **Step 3: Replace validation GETs with one reader per call**

Use grouped `getMany` reads for unique EPG paths, eligible node paths, eligible port/IPG paths, conflict paths, and binding paths. Preserve existing status messages, row ordering, and the concurrency value of 10. Keep all POST functions on `apicFetch`.

- [ ] **Step 4: Run static-port tests and commit**

Run: `bun test src/lib/apic/apic.test.ts src/lib/apic/csv.test.ts src/lib/apic/paths.test.ts`
Expected: PASS.

Commit: `perf(apic): group static port review reads`

### Task 3: Bridge-domain validation grouping

**Files:**
- Create: `src/lib/apic/bridge-domains/apic.test.ts`
- Modify: `src/lib/apic/bridge-domains/apic.ts:1-268`

**Interfaces:**
- Consumes: `ApicReader` and `createApicReader` from Task 1.
- Preserves: L2/L3 deploy and rollback validation results and write paths.

- [ ] **Step 1: Write failing L2/L3 grouping tests**

Create repeated-parent rows and a path-aware fake reader. Assert one tenant and VRF read for L2, one tenant/VRF/L3Out read for L3, unique BD state per DN, shared rollback state reads, original row order, and unchanged statuses.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test src/lib/apic/bridge-domains/apic.test.ts`
Expected: FAIL because bridge-domain validators still perform direct per-row GETs.

- [ ] **Step 3: Refactor read helpers to consume the request reader**

Make `moExists` and `readBridgeDomain` consume `ApicReader`. Use `getMany` in parent-to-target phases and reuse bridge-domain/children results by exact path. Keep `postApic`, deploy, and rollback writes unchanged.

- [ ] **Step 4: Run bridge-domain tests and commit**

Run: `bun test src/lib/apic/bridge-domains`
Expected: PASS.

Commit: `perf(apic): group bridge domain review reads`

### Task 4: EPG validation grouping

**Files:**
- Create: `src/lib/apic/epgs/apic.test.ts`
- Modify: `src/lib/apic/epgs/apic.ts:1-260,386-439`

**Interfaces:**
- Consumes: `ApicReader` and `createApicReader` from Task 1.
- Preserves: unified and legacy EPG validation behavior, contract-role handling, and deployment grouping.

- [ ] **Step 1: Write failing shared-MO EPG tests**

Validate rows sharing tenant, ANP, BD, physical domain, contract, and EPG while requesting different relation roles. Assert shared APIC paths are fetched once, EPG children are read once, results retain original row indexes/statuses, and separate validation calls do not share state.

- [ ] **Step 2: Run the tests and verify RED**

Run: `bun test src/lib/apic/epgs/apic.test.ts`
Expected: FAIL because EPG helpers use direct GET requests and create no request reader.

- [ ] **Step 3: Route all EPG validation reads through one reader**

Pass `ApicReader` through existence, ambiguity, contract, and children helpers. Prime unique shared parent paths, validate parents with cached results, then group EPG and children paths for eligible rows. Legacy wrappers continue delegating to unified validators.

- [ ] **Step 4: Run EPG tests and commit**

Run: `bun test src/lib/apic/epgs`
Expected: PASS.

Commit: `perf(apic): group epg review reads`

### Task 5: Review and issue pagination

**Files:**
- Create: `src/components/review-pagination.ts`
- Create: `src/components/review-pagination.test.ts`
- Modify: `src/components/PreviewSection.tsx:1-430`

**Interfaces:**
- Produces: `REVIEW_PAGE_SIZE = 100` and `paginateReviewItems<T>(items, requestedPage)`.
- Preserves: full-row validation summaries and actionable-row deployment.

- [ ] **Step 1: Write failing pagination boundary tests**

Test empty, first, middle, final, underflow, and overflow pages. Assert safe page, total pages, visible items, and one-based visible range.

- [ ] **Step 2: Run the helper test and verify RED**

Run: `bun test src/components/review-pagination.test.ts`
Expected: FAIL because the pagination helper does not exist.

- [ ] **Step 3: Implement the pure pagination helper**

Return `{ items, page, totalPages, rangeStart, rangeEnd }`, clamp requested pages, and use a fixed default size of 100.

- [ ] **Step 4: Run the helper test and verify GREEN**

Run: `bun test src/components/review-pagination.test.ts`
Expected: PASS.

- [ ] **Step 5: Paginate the Review component**

Maintain independent table and issue pages. Render only the current table slice while passing the original index to column cells. Show range/total and Previous/Next buttons. Mount issue rows only when expanded, paginate their error-first ordering, and reset the issue page on close. Keep `actionableRows`, counts, session expiry, and deploy callbacks based on complete collections.

- [ ] **Step 6: Run component tests, lint, and commit**

Run: `bun test src/components/review-pagination.test.ts && bunx eslint src/components/PreviewSection.tsx src/components/review-pagination.ts src/components/review-pagination.test.ts`
Expected: PASS with no lint errors.

Commit: `perf(ui): paginate workflow review results`

### Task 6: Full verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes all prior tasks.
- Produces a verified implementation matching the approved design.

- [ ] **Step 1: Run the full automated test suite**

Run: `bun test`
Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `bun run lint`
Expected: exit code 0 with no errors.

- [ ] **Step 3: Run the production build**

Run: `bun run build`
Expected: exit code 0.

- [ ] **Step 4: Inspect the final diff and requirement coverage**

Run: `git diff --check HEAD~5..HEAD && git status --short`
Expected: no whitespace errors; only intended implementation files and committed planning artifacts are present.
