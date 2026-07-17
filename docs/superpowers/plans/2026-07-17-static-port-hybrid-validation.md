# Static-Port Hybrid Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route static-port Reviews with 0–100 rows through exact cached APIC reads and Reviews with 101+ rows through paged bulk snapshots.

**Architecture:** Restore the phased exact deploy and rollback validators in a focused module that consumes one request-scoped `ApicReader`. Keep snapshot-backed validation as explicit helpers, and make the public route handlers dispatch once from a pure 100-row strategy selector.

**Tech Stack:** TypeScript, Bun test, Node HTTPS, Next.js 16.

## Global Constraints

- Row counts 0 through 100 use exact validation.
- Row counts 101 and above use bulk snapshot validation.
- Exact validation retains request-scoped caching, in-flight deduplication, concurrency 10, and HTTPS keep-alive.
- Snapshot paging, deployment writes, rollback writes, and all other workflow validators remain unchanged.
- Both strategies preserve row order, statuses, messages, and request isolation.

---

### Task 1: Restore focused exact static-port validators

**Files:**
- Create: `src/lib/apic/static-port-exact.ts`
- Create: `src/lib/apic/static-port-exact.test.ts`

**Interfaces:**
- Consumes: `ApicReader`, `createApicReader`, the static-port path builders, and `ParsedRow`.
- Produces: `validateDeployRowsExact(rows, host, token, reader?)` and `validateRollbackRowsExact(rows, host, token, reader?)`.

- [ ] **Step 1: Write failing exact-validator tests**

Create two vPC rows with different EPG/VLAN targets but shared nodes and bundle group. Inject a reader backed by a path-aware fetcher:

```ts
const calls = new Map<string, number>()
const reader = createApicReader('apic.local', 'token', async (_host, path) => {
  calls.set(path, (calls.get(path) ?? 0) + 1)
  const targetOrConflict = path.includes('fvRsPathAtt') || path.includes('/rspathAtt-[')
  return Response.json({ imdata: targetOrConflict ? [] : [{}] })
})

const results = await validateDeployRowsExact(rows, 'apic.local', 'token', reader)
expect(results.map(result => result.status)).toEqual(['deploy', 'deploy'])
expect(calls.get(buildNodePath(101))).toBe(1)
expect(calls.get(buildNodePath(102))).toBe(1)
expect(calls.get(buildPortPath(rows[0]))).toBe(1)
```

Add a rollback test with duplicate rows and assert `buildMoPath(row)` is fetched once. Add an empty-array test and assert the fetcher is never called.

- [ ] **Step 2: Run tests and verify RED**

Run: `bun test src/lib/apic/static-port-exact.test.ts`

Expected: FAIL because `static-port-exact.ts` does not exist.

- [ ] **Step 3: Implement phased exact validation**

Move the previously shipped exact read behavior into the new module. Deploy uses one reader and these `getMany` phases:

```ts
const epgStates = await reader.getMany<Imdata>(rows.map(buildEpgPath))
const nodeStates = await reader.getMany<Imdata>(epgEligibleRows.flatMap(row =>
  (row.port_type === 'vpc' ? [row.node1, row.node2!] : [row.node1]).map(buildNodePath)
))
const portStates = await reader.getMany<Imdata>(nodeEligibleRows.map(buildPortPath))
const conflictStates = await reader.getMany<ConflictData>(
  portEligibleRows.map(buildEncapConflictQuery),
)
const targetStates = await reader.getMany<Imdata>(targetEligibleRows.map(buildMoPath))
```

Map the original rows after the reads and preserve the existing EPG, node, port, conflict, target, HTTP, and network result messages. Rollback loads unique `buildMoPath` values once and preserves `missing`, `rollback`, and error behavior. An empty input naturally issues no reader fetches.

- [ ] **Step 4: Run exact-validator tests and verify GREEN**

Run: `bun test src/lib/apic/static-port-exact.test.ts src/lib/apic/read-cache.test.ts`

Expected: all exact and cache tests pass.

- [ ] **Step 5: Run scoped lint and commit**

Run: `bunx eslint src/lib/apic/static-port-exact.ts src/lib/apic/static-port-exact.test.ts`

Expected: exit code 0.

Commit: `perf(apic): restore exact validation for small reviews`

### Task 2: Add the 100-row hybrid dispatcher

**Files:**
- Create: `src/lib/apic/static-port-strategy.ts`
- Create: `src/lib/apic/static-port-strategy.test.ts`
- Modify: `src/lib/apic/apic.ts`
- Modify: `src/lib/apic/apic.test.ts`

**Interfaces:**
- Consumes: exact validators from Task 1 and the existing snapshot loader.
- Produces: `STATIC_PORT_BULK_THRESHOLD`, `selectStaticPortValidationStrategy(rowCount)`, `validateDeployRowsFromSnapshot`, and `validateRollbackRowsFromSnapshot`.
- Preserves: public `validateDeployRows(rows, host, token)` and `validateRollbackRows(rows, host, token)` route-handler signatures.

- [ ] **Step 1: Write the failing boundary test**

```ts
expect(STATIC_PORT_BULK_THRESHOLD).toBe(100)
expect(selectStaticPortValidationStrategy(0)).toBe('exact')
expect(selectStaticPortValidationStrategy(1)).toBe('exact')
expect(selectStaticPortValidationStrategy(100)).toBe('exact')
expect(selectStaticPortValidationStrategy(101)).toBe('snapshot')
expect(selectStaticPortValidationStrategy(3_680)).toBe('snapshot')
```

- [ ] **Step 2: Run the strategy test and verify RED**

Run: `bun test src/lib/apic/static-port-strategy.test.ts`

Expected: FAIL because the strategy module does not exist.

- [ ] **Step 3: Implement the pure selector**

```ts
export const STATIC_PORT_BULK_THRESHOLD = 100
export type StaticPortValidationStrategy = 'exact' | 'snapshot'

export function selectStaticPortValidationStrategy(
  rowCount: number,
): StaticPortValidationStrategy {
  return rowCount > STATIC_PORT_BULK_THRESHOLD ? 'snapshot' : 'exact'
}
```

- [ ] **Step 4: Run the strategy test and verify GREEN**

Run: `bun test src/lib/apic/static-port-strategy.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing dispatcher-facing tests**

Change existing snapshot behavior tests to import `validateDeployRowsFromSnapshot` and `validateRollbackRowsFromSnapshot`; these exports do not exist yet, so the test must fail.

- [ ] **Step 6: Run APIC tests and verify RED**

Run: `bun test src/lib/apic/apic.test.ts`

Expected: FAIL because the snapshot helper exports do not exist.

- [ ] **Step 7: Add public hybrid dispatch**

Rename the current snapshot implementations to the explicit `FromSnapshot` exports, retaining their optional snapshot-loader test dependency. Add route-compatible public dispatchers:

```ts
export async function validateDeployRows(
  rows: ParsedRow[],
  apicHost: string,
  apicToken: string,
): Promise<ValidationResult[]> {
  return selectStaticPortValidationStrategy(rows.length) === 'snapshot'
    ? validateDeployRowsFromSnapshot(rows, apicHost, apicToken)
    : validateDeployRowsExact(rows, apicHost, apicToken)
}
```

Implement the equivalent rollback dispatcher. Do not change `deployRows` or `rollbackRows`.

- [ ] **Step 8: Run hybrid tests and lint**

Run: `bun test src/lib/apic/apic.test.ts src/lib/apic/static-port-exact.test.ts src/lib/apic/static-port-strategy.test.ts src/lib/apic/static-port-snapshot.test.ts src/lib/apic/read-cache.test.ts`

Expected: all hybrid, exact, snapshot, and cache tests pass.

Run: `bunx eslint src/lib/apic/apic.ts src/lib/apic/apic.test.ts src/lib/apic/static-port-exact.ts src/lib/apic/static-port-exact.test.ts src/lib/apic/static-port-strategy.ts src/lib/apic/static-port-strategy.test.ts`

Expected: exit code 0.

- [ ] **Step 9: Commit hybrid dispatch**

Commit: `perf(apic): select validation strategy by row count`

### Task 3: Verification and PR preparation

**Files:**
- Verify all files changed by Tasks 1 and 2.

**Interfaces:**
- Consumes: complete hybrid validation.
- Produces: verified commits ready to publish as a follow-up PR.

- [ ] **Step 1: Run APIC and Review tests**

Run: `bun test src/lib/apic src/components/review-pagination.test.ts`

Expected: all scoped tests pass.

- [ ] **Step 2: Run the full suite**

Run: `bun test`

Expected: new tests pass; compare failures with the recorded endpoint-query and EPG-query baseline failures.

- [ ] **Step 3: Run feature-scoped lint and production build**

Run: `bunx eslint src/lib/apic/apic.ts src/lib/apic/apic.test.ts src/lib/apic/static-port-exact.ts src/lib/apic/static-port-exact.test.ts src/lib/apic/static-port-strategy.ts src/lib/apic/static-port-strategy.test.ts src/lib/apic/static-port-snapshot.ts src/lib/apic/static-port-snapshot.test.ts && bun run build`

Expected: scoped lint and production build exit 0.

- [ ] **Step 4: Inspect the final branch**

Run: `git diff --check main..HEAD && git status --short --branch && git log --oneline main..HEAD`

Expected: no whitespace errors, a clean branch, and only hybrid design, plan, and implementation commits.
