# Static-Port Bulk Snapshot Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace thousands of row-derived static-port Review GETs with paged APIC class snapshots and local indexed validation.

**Architecture:** A new `static-port-snapshot.ts` module loads APIC class pages directly through the shared keep-alive client, folds each page into compact indexes, and reports component-level read failures without accepting partial data. Static-port deploy and rollback validators consume those indexes in original CSV order; all POST behavior and other workflow validators remain unchanged.

**Tech Stack:** TypeScript, Bun test, Node HTTPS, Cisco APIC REST class queries, Next.js 16.

## Global Constraints

- Validation concurrency must not exceed 10; the snapshot loader has at most four simultaneous class reads and reads pages sequentially per class.
- Snapshot state is request-scoped and is never persisted or returned to the browser.
- Static-port deployment and rollback POST paths and payloads remain unchanged.
- Bridge-domain, EPG workflow, and interface-selector validators are unchanged.
- APIC class pages contain 5,000 top-level managed objects.
- A failed page invalidates its whole inventory component; partial state is never used for validation.

---

### Task 1: Paged class loader and compact snapshot indexes

**Files:**
- Create: `src/lib/apic/static-port-snapshot.ts`
- Create: `src/lib/apic/static-port-snapshot.test.ts`

**Interfaces:**
- Consumes: `apicFetch(host, path, init)` and `ApicFetcher`-compatible injected fetchers.
- Produces: `SnapshotRead<T>`, `EpgBindingIndex`, `StaticPortSnapshot`, `StaticPortSnapshotRequirements`, `StaticPortSnapshotLoader`, `bindingLookupKey(tDn, encap)`, and `loadStaticPortSnapshot(host, token, requirements, fetcher?)`.

- [ ] **Step 1: Write failing paging and parser tests**

Create fixtures for `fvAEPg`, nested `fvRsPathAtt`, `fabricNode`, `infraAccBndlGrp`, and `fabricPathEp`. The tests must assert:

```ts
const snapshot = await loadStaticPortSnapshot(
  'apic.local',
  'token',
  { nodes: true, bundles: true, physicalPaths: true },
  fetcher,
)

expect(snapshot.epgBindings.ok).toBe(true)
if (snapshot.epgBindings.ok) {
  expect(snapshot.epgBindings.value.epgDns).toContain('uni/tn-TenantA/ap-AppA/epg-Web')
  expect(snapshot.epgBindings.value.bindingsByDn.has(bindingDn)).toBe(true)
  expect(snapshot.epgBindings.value.bindingDnsByPathAndEncap.get(
    bindingLookupKey(pathDn, 'vlan-100'),
  )).toEqual([bindingDn])
}
```

Use a two-page response with `totalCount: "5001"` and assert only page 0 and page 1 are requested. Add tests proving missing/malformed `totalCount` stops after page zero, skipped requirements make no corresponding class request, and a failed second page returns a failed component rather than partial indexes.

- [ ] **Step 2: Run the snapshot tests and verify RED**

Run: `bun test src/lib/apic/static-port-snapshot.test.ts`

Expected: FAIL because `static-port-snapshot.ts` and its exports do not exist.

- [ ] **Step 3: Implement the minimal paged snapshot loader**

Define the public result types:

```ts
export type SnapshotRead<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string }

export interface EpgBindingIndex {
  epgDns: Set<string>
  bindingsByDn: Map<string, { tDn: string; encap: string }>
  bindingDnsByPathAndEncap: Map<string, string[]>
}

export interface StaticPortSnapshot {
  epgBindings: SnapshotRead<EpgBindingIndex>
  nodes: SnapshotRead<Set<number>>
  bundles: SnapshotRead<Set<string>>
  physicalPaths: SnapshotRead<Set<string>>
}

export interface StaticPortSnapshotRequirements {
  nodes: boolean
  bundles: boolean
  physicalPaths: boolean
}
```

Implement a private page loop with `SNAPSHOT_PAGE_SIZE = 5_000`. Build page paths using `?` or `&` as appropriate, parse `totalCount` only when it is a finite non-negative integer, and process each successful page before requesting the next. Catch network errors as status zero and include at most 200 characters of an HTTP error response.

Load these component paths concurrently with `Promise.all`:

```ts
const EPG_PATH = '/api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt'
const NODE_PATH = '/api/node/class/fabricNode.json'
const BUNDLE_PATH = '/api/node/class/infraAccBndlGrp.json'
const PHYSICAL_PATH = '/api/node/class/fabricPathEp.json'
```

For a skipped component, return `{ ok: true, value: new Set() }` without issuing an APIC request. Fold each page immediately into its target indexes and discard references to the page data before continuing.

- [ ] **Step 4: Run snapshot tests and verify GREEN**

Run: `bun test src/lib/apic/static-port-snapshot.test.ts`

Expected: PASS for paging, parsing, failure, and skipped-inventory cases.

- [ ] **Step 5: Run scoped lint and commit Task 1**

Run: `bunx eslint src/lib/apic/static-port-snapshot.ts src/lib/apic/static-port-snapshot.test.ts`

Expected: exit code 0.

Commit: `perf(apic): add paged static port snapshots`

### Task 2: Snapshot-backed deploy and rollback validation

**Files:**
- Modify: `src/lib/apic/paths.ts`
- Modify: `src/lib/apic/paths.test.ts`
- Modify: `src/lib/apic/apic.ts`
- Modify: `src/lib/apic/apic.test.ts`

**Interfaces:**
- Consumes: `StaticPortSnapshotLoader`, `StaticPortSnapshot`, and `bindingLookupKey` from Task 1.
- Produces: `buildEpgDn(row)` and `buildMoDn(row)` path helpers.
- Preserves: the three-argument route-handler contract; tests may inject an optional fourth `StaticPortSnapshotLoader`.

- [ ] **Step 1: Write failing DN helper tests**

Add exact expected-DN assertions:

```ts
expect(buildEpgDn(row)).toBe('uni/tn-TenantA/ap-AppA/epg-Web')
expect(buildMoDn(row)).toBe(
  'uni/tn-TenantA/ap-AppA/epg-Web/rspathAtt-[topology/pod-1/protpaths-101-102/pathep-[WEB-VPC]]',
)
```

- [ ] **Step 2: Run path tests and verify RED**

Run: `bun test src/lib/apic/paths.test.ts`

Expected: FAIL because `buildEpgDn` and `buildMoDn` do not exist.

- [ ] **Step 3: Implement DN helpers and reuse them in existing path builders**

Implement:

```ts
export function buildEpgDn(row: ParsedRow): string {
  return `uni/tn-${row.tenant}/ap-${row.ap}/epg-${row.epg}`
}

export function buildMoDn(row: ParsedRow): string {
  return `${buildEpgDn(row)}/rspathAtt-[${buildPathSegment(row)}]`
}
```

Make `buildEpgPath` and `buildMoPath` wrap these DNs without changing their output.

- [ ] **Step 4: Run path tests and verify GREEN**

Run: `bun test src/lib/apic/paths.test.ts`

Expected: PASS.

- [ ] **Step 5: Replace call-count tests with failing snapshot behavior tests**

In `apic.test.ts`, inject a loader returning controlled indexes. Cover:

- a deploy row with a valid EPG/node/bundle and absent target returns `deploy`;
- an exact binding returns `exists`;
- a different binding with the same `tDn` and `encap` returns the existing VLAN-conflict error including the conflicting DN;
- missing EPG, node, bundle, and physical path return the existing object-not-found messages;
- vPC requires both node IDs;
- rollback returns `rollback` for an exact binding and `missing` otherwise;
- snapshot component failures return `error` rather than false missing/deploy results;
- 3,680 unique rows invoke the injected loader once and perform no per-row fetches;
- deploy requirements skip bundle or physical-path inventory when unused;
- rollback requirements request only EPG/binding state.

- [ ] **Step 6: Run validator tests and verify RED**

Run: `bun test src/lib/apic/apic.test.ts`

Expected: FAIL because the validators still consume `ApicReader` and row-derived GET paths.

- [ ] **Step 7: Implement snapshot-backed validation**

Change the optional dependency to `StaticPortSnapshotLoader = loadStaticPortSnapshot`. Deploy computes requirements from the rows, loads one snapshot, and maps rows synchronously in original order. Use:

```ts
const conflictDns = index.bindingDnsByPathAndEncap.get(
  bindingLookupKey(buildPathSegment(row), `vlan-${row.vlan}`),
) ?? []
const intendedDn = buildMoDn(row)
const conflictDn = conflictDns.find(dn => dn !== intendedDn)
```

Bundle validation checks `bundleGroupNames` for PC/vPC rows. Direct-port validation checks `physicalPathDns` for `buildPathSegment(row)`. Rollback loads only EPG/binding state and checks `bindingsByDn.has(buildMoDn(row))`.

Remove static-port validator imports and use of `createApicReader`, `ApicReader`, row-derived conflict queries, and per-row validation GETs. Leave `deployRows` and `rollbackRows` unchanged except for reusing `buildMoDn` when constructing their existing payload DN.

- [ ] **Step 8: Run static-port tests and scoped lint**

Run: `bun test src/lib/apic/apic.test.ts src/lib/apic/paths.test.ts src/lib/apic/static-port-snapshot.test.ts src/lib/apic/csv.test.ts`

Expected: PASS.

Run: `bunx eslint src/lib/apic/apic.ts src/lib/apic/apic.test.ts src/lib/apic/paths.ts src/lib/apic/paths.test.ts src/lib/apic/static-port-snapshot.ts src/lib/apic/static-port-snapshot.test.ts`

Expected: exit code 0.

- [ ] **Step 9: Commit Task 2**

Commit: `perf(apic): validate static ports from bulk snapshots`

### Task 3: Regression and production verification

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes: the complete snapshot-backed static-port validator.
- Produces: evidence that the feature branch remains buildable and existing unrelated behavior has not regressed.

- [ ] **Step 1: Run the complete APIC and Review test scope**

Run: `bun test src/lib/apic src/components/review-pagination.test.ts`

Expected: all scoped tests pass.

- [ ] **Step 2: Run the full project test suite**

Run: `bun test`

Expected: the new tests pass; compare any failures against the two previously recorded baseline failures in `src/lib/endpoints/query.test.ts` and `src/lib/epgs/query.test.ts`.

- [ ] **Step 3: Run lint**

Run: `bun run lint`

Expected: no new lint errors; compare full-project output against the previously recorded errors in `FaultsClient.tsx` and `HealthScoresClient.tsx`.

- [ ] **Step 4: Run the production build**

Run: `bun run build`

Expected: exit code 0.

- [ ] **Step 5: Inspect branch state and diff quality**

Run: `git diff --check HEAD~2..HEAD && git status --short --branch && git log --oneline -6`

Expected: no whitespace errors, a clean feature branch, and only the two implementation commits plus the design/plan commit history.
