# Interface State Tracking Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PR #12's state-change filter accurate, window-boundary aware, scalable, and resilient to stale drawer request failures.

**Architecture:** Separate Prisma filter construction, PostgreSQL transition detection, status-history serialization, and drawer request-state derivation into focused testable helpers. The page receives only changed interface IDs from a database `LAG` query, while the drawer adds one hidden pre-window baseline sample before serializing visible history.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma 6, PostgreSQL, Bun test, ESLint.

## Global Constraints

- Do not add a schema migration or persistent transition table.
- Preserve the existing 7-day and 30-day State Changes options.
- Preserve existing authentication and missing-interface behavior.
- Use case-insensitive state comparisons.
- Do not redesign the interface-health table or drawer.
- Modified files must pass ESLint and `git diff --check`.

---

### Task 1: Compose state and text filters safely

**Files:**
- Create: `src/app/(app)/interface-health/interface-query.ts`
- Create: `src/app/(app)/interface-health/interface-query.test.ts`
- Modify: `src/app/(app)/interface-health/page.tsx:131-153`

**Interfaces:**
- Produces: `buildInterfaceSnapshotWhere(input: InterfaceSnapshotFilterInput): Prisma.InterfaceSnapshotWhereInput`
- Consumes: APIC host ID, view, window start, changed IDs, node filters, and optional query text.

- [ ] **Step 1: Write failing query-composition tests**

```ts
import { describe, expect, it } from 'bun:test'
import { buildInterfaceSnapshotWhere } from './interface-query'

describe('buildInterfaceSnapshotWhere', () => {
  const windowStart = new Date('2026-07-10T00:00:00Z')

  it('ANDs the state-change and search OR groups', () => {
    expect(buildInterfaceSnapshotWhere({
      apicHostId: 'host-1',
      view: 'state-changed',
      windowStart,
      stateChangedInterfaceIds: ['if-1'],
      nodeFilter: [],
      query: 'eth1/10',
    })).toEqual({
      apicHostId: 'host-1',
      AND: [
        { OR: [
          { lastLinkStChg: { gte: windowStart } },
          { id: { in: ['if-1'] } },
        ] },
        { OR: [
          { ifName: { contains: 'eth1/10', mode: 'insensitive' } },
          { node: { contains: 'eth1/10', mode: 'insensitive' } },
          { description: { contains: 'eth1/10', mode: 'insensitive' } },
          { dn: { contains: 'eth1/10', mode: 'insensitive' } },
        ] },
      ],
    })
  })

  it('omits the search group when the query is blank', () => {
    const where = buildInterfaceSnapshotWhere({
      apicHostId: 'host-1', view: 'state-changed', windowStart,
      stateChangedInterfaceIds: [], nodeFilter: [], query: '   ',
    })
    expect(where.AND).toEqual([{ OR: [
      { lastLinkStChg: { gte: windowStart } },
      { id: { in: [] } },
    ] }])
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/interface-health/interface-query.test.ts'`
Expected: FAIL because `interface-query.ts` does not exist.

- [ ] **Step 3: Implement the typed filter builder and use it from the page**

```ts
import type { Prisma } from '@prisma/client'

export type InterfaceView = 'all' | 'crc' | 'state-changed'

export interface InterfaceSnapshotFilterInput {
  apicHostId: string
  view: InterfaceView
  windowStart: Date
  stateChangedInterfaceIds: string[]
  crcInterfaceIds?: string[]
  nodeFilter: string[]
  query?: string
}

export function buildInterfaceSnapshotWhere(
  input: InterfaceSnapshotFilterInput,
): Prisma.InterfaceSnapshotWhereInput {
  const query = input.query?.trim()
  const groups: Prisma.InterfaceSnapshotWhereInput[] = []
  if (input.view === 'state-changed') groups.push({ OR: [
    { lastLinkStChg: { gte: input.windowStart } },
    { id: { in: input.stateChangedInterfaceIds } },
  ] })
  if (query) groups.push({ OR: [
    { ifName: { contains: query, mode: 'insensitive' } },
    { node: { contains: query, mode: 'insensitive' } },
    { description: { contains: query, mode: 'insensitive' } },
    { dn: { contains: query, mode: 'insensitive' } },
  ] })
  return {
    apicHostId: input.apicHostId,
    ...(input.view === 'crc' ? { id: { in: input.crcInterfaceIds ?? [] } } : {}),
    ...(input.nodeFilter.length ? { node: { in: input.nodeFilter } } : {}),
    ...(groups.length ? { AND: groups } : {}),
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test 'src/app/(app)/interface-health/interface-query.test.ts'`
Expected: PASS.

- [ ] **Step 5: Commit the isolated filter fix**

```bash
git add 'src/app/(app)/interface-health/interface-query.ts' \
  'src/app/(app)/interface-health/interface-query.test.ts' \
  'src/app/(app)/interface-health/page.tsx'
git commit -m "fix(interface-health): compose state and search filters"
```

### Task 2: Detect the first in-window transition in drawer history

**Files:**
- Modify: `src/app/(app)/interface-health/state-changes.ts:8-58`
- Modify: `src/app/(app)/interface-health/status-samples.test.ts`
- Modify: `src/actions/interface-samples.ts:48-92`

**Interfaces:**
- Changes: `serializeStatusSamples(samples, baseline?)` accepts one optional `RawStatusHistorySample` baseline and returns visible `StatusHistorySample[]` only.

- [ ] **Step 1: Add a failing boundary regression test**

```ts
it('uses a hidden pre-window baseline to flag the first visible transition', () => {
  const baseline = {
    id: 'baseline', sampledAt: new Date('2026-06-30T23:55:00Z'),
    adminSt: 'up', operSt: 'up', operSpeed: '10G',
  }
  const visible = [{
    id: 'visible', sampledAt: new Date('2026-07-01T00:00:00Z'),
    adminSt: 'up', operSt: 'down', operSpeed: 'unknown',
  }]
  expect(serializeStatusSamples(visible, baseline)).toEqual([{
    id: 'visible', sampledAt: '2026-07-01T00:00:00.000Z',
    adminSt: 'up', operSt: 'down', operSpeed: 'unknown', isStateChange: true,
  }])
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/interface-health/status-samples.test.ts'`
Expected: FAIL because the serializer ignores a second argument.

- [ ] **Step 3: Implement hidden-baseline serialization and fetch the baseline**

```ts
export function serializeStatusSamples(
  samples: RawStatusHistorySample[],
  baseline: RawStatusHistorySample | null = null,
): StatusHistorySample[] {
  const comparisonSamples = baseline ? [baseline, ...samples] : samples
  const serialized = comparisonSamples.map((sample, index) => {
    const previous = index > 0 ? comparisonSamples[index - 1] : null
    return {
      id: sample.id,
      sampledAt: sample.sampledAt.toISOString(),
      adminSt: sample.adminSt,
      operSt: sample.operSt,
      operSpeed: sample.operSpeed,
      isStateChange: previous !== null && (
        previous.adminSt.toLowerCase() !== sample.adminSt.toLowerCase()
        || previous.operSt.toLowerCase() !== sample.operSt.toLowerCase()
      ),
    }
  })
  return baseline ? serialized.slice(1) : serialized
}

const baseline = cutoff
  ? await prisma.interfaceSample.findFirst({
      where: { interfaceId, sampledAt: { lt: cutoff } },
      orderBy: { sampledAt: 'desc' },
      select: statusSampleSelect,
    })
  : null
```

Fetch snapshot, visible samples, and baseline concurrently after defining a
shared `statusSampleSelect`, then pass `baseline` to the serializer.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `bun test 'src/app/(app)/interface-health/status-samples.test.ts' 'src/app/(app)/interface-health/state-changes.test.ts'`
Expected: PASS.

- [ ] **Step 5: Commit the boundary fix**

```bash
git add src/actions/interface-samples.ts \
  'src/app/(app)/interface-health/state-changes.ts' \
  'src/app/(app)/interface-health/status-samples.test.ts'
git commit -m "fix(interface-health): compare status window baseline"
```

### Task 3: Scope drawer failures to request keys

**Files:**
- Create: `src/app/(app)/interface-health/drawer-request-state.ts`
- Create: `src/app/(app)/interface-health/drawer-request-state.test.ts`
- Modify: `src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx:84-180`

**Interfaces:**
- Produces: `makeDrawerRequestKey(mode, interfaceId, range): string`
- Produces: `resolveDrawerRequest<T>(activeKey, result): DrawerRequestView<T>`

- [ ] **Step 1: Write failing request-state tests**

```ts
import { describe, expect, it } from 'bun:test'
import { makeDrawerRequestKey, resolveDrawerRequest } from './drawer-request-state'

describe('resolveDrawerRequest', () => {
  it('shows an error only for the request key that failed', () => {
    const failed = { key: 'errors:if-1:7d', data: null, failed: true }
    expect(resolveDrawerRequest('errors:if-1:7d', failed).failed).toBe(true)
    expect(resolveDrawerRequest('errors:if-1:30d', failed)).toEqual({
      loading: true, failed: false, data: null,
    })
  })

  it('includes mode, interface, and range in the key', () => {
    expect(makeDrawerRequestKey('status', 'if-1', '30d')).toBe('status:if-1:30d')
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/interface-health/drawer-request-state.test.ts'`
Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the pure state helper and refactor the drawer**

```ts
export interface DrawerRequestResult<T> {
  key: string
  data: T | null
  failed: boolean
}

export function makeDrawerRequestKey(
  mode: 'errors' | 'status',
  interfaceId: string,
  range: string,
): string {
  return `${mode}:${interfaceId}:${range}`
}

export function resolveDrawerRequest<T>(
  activeKey: string | null,
  result: DrawerRequestResult<T> | null,
) {
  if (!activeKey || result?.key !== activeKey) {
    return { loading: Boolean(activeKey), failed: false, data: null }
  }
  return { loading: false, failed: result.failed, data: result.data }
}
```

Store separate keyed error/status results. Derive loading and failure through
the helper. In the effect, store keyed success/failure only in promise
callbacks and retain the cancellation guard; remove synchronous effect-entry
state setters and the old failure booleans.

- [ ] **Step 4: Run test and changed-file ESLint**

Run: `bun test 'src/app/(app)/interface-health/drawer-request-state.test.ts' && bunx eslint 'src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx' 'src/app/(app)/interface-health/drawer-request-state.ts' 'src/app/(app)/interface-health/drawer-request-state.test.ts'`
Expected: PASS with no ESLint errors.

- [ ] **Step 5: Commit the drawer fix**

```bash
git add 'src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx' \
  'src/app/(app)/interface-health/drawer-request-state.ts' \
  'src/app/(app)/interface-health/drawer-request-state.test.ts'
git commit -m "fix(interface-health): scope drawer request failures"
```

### Task 4: Move page transition detection into PostgreSQL

**Files:**
- Create: `src/app/(app)/interface-health/state-change-query.ts`
- Create: `src/app/(app)/interface-health/state-change-query.test.ts`
- Modify: `src/app/(app)/interface-health/page.tsx:119-129`
- Modify: `src/app/(app)/interface-health/state-changes.ts:1-90`
- Modify: `src/app/(app)/interface-health/state-changes.test.ts`

**Interfaces:**
- Produces: `buildStateChangedInterfaceIdsQuery(apicHostId, windowStart): Prisma.Sql`
- Produces: `queryStateChangedInterfaceIds(execute, apicHostId, windowStart): Promise<string[]>`

- [ ] **Step 1: Write failing query helper tests**

```ts
import { describe, expect, it } from 'bun:test'
import {
  buildStateChangedInterfaceIdsQuery,
  queryStateChangedInterfaceIds,
} from './state-change-query'

describe('state change SQL query', () => {
  it('includes a pre-window baseline and window comparison', () => {
    const windowStart = new Date('2026-07-10T00:00:00Z')
    const query = buildStateChangedInterfaceIdsQuery('host-1', windowStart)
    const text = query.strings.join('?')
    expect(text).toContain('JOIN LATERAL')
    expect(text).toContain('LAG(')
    expect(text).toContain('"previousSampledAt"')
    expect(query.values).toContain('host-1')
    expect(query.values).toContain(windowStart)
  })

  it('returns only IDs from the executor rows', async () => {
    const ids = await queryStateChangedInterfaceIds(
      async () => [{ interfaceId: 'if-1' }],
      'host-1',
      new Date('2026-07-10T00:00:00Z'),
    )
    expect(ids).toEqual(['if-1'])
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/interface-health/state-change-query.test.ts'`
Expected: FAIL because the query helper does not exist.

- [ ] **Step 3: Implement the database query and page integration**

```ts
import { Prisma } from '@prisma/client'

export type StateChangeQueryExecutor = (
  query: Prisma.Sql,
) => Promise<Array<{ interfaceId: string }>>

export function buildStateChangedInterfaceIdsQuery(
  apicHostId: string,
  windowStart: Date,
): Prisma.Sql {
  return Prisma.sql`
    WITH host_interfaces AS (
      SELECT id
      FROM interface_snapshot
      WHERE "apicHostId" = ${apicHostId}
    ), baseline AS (
      SELECT
        host_interfaces.id AS "interfaceId",
        previous."sampledAt",
        previous."adminSt",
        previous."operSt"
      FROM host_interfaces
      JOIN LATERAL (
        SELECT sample."sampledAt", sample."adminSt", sample."operSt"
        FROM interface_sample AS sample
        WHERE sample."interfaceId" = host_interfaces.id
          AND sample."sampledAt" < ${windowStart}
        ORDER BY sample."sampledAt" DESC
        LIMIT 1
      ) AS previous ON TRUE
    ), candidate_samples AS (
      SELECT sample."interfaceId", sample."sampledAt", sample."adminSt", sample."operSt"
      FROM interface_sample AS sample
      WHERE sample."apicHostId" = ${apicHostId}
        AND sample."sampledAt" >= ${windowStart}
      UNION ALL
      SELECT "interfaceId", "sampledAt", "adminSt", "operSt"
      FROM baseline
    ), with_previous AS (
      SELECT
        "interfaceId",
        "sampledAt",
        LOWER("adminSt") AS "adminSt",
        LOWER("operSt") AS "operSt",
        LAG("sampledAt") OVER state_history AS "previousSampledAt",
        LAG(LOWER("adminSt")) OVER state_history AS "previousAdminSt",
        LAG(LOWER("operSt")) OVER state_history AS "previousOperSt"
      FROM candidate_samples
      WINDOW state_history AS (
        PARTITION BY "interfaceId" ORDER BY "sampledAt"
      )
    )
    SELECT DISTINCT "interfaceId"
    FROM with_previous
    WHERE "sampledAt" >= ${windowStart}
      AND "previousSampledAt" IS NOT NULL
      AND (
        "previousAdminSt" IS DISTINCT FROM "adminSt"
        OR "previousOperSt" IS DISTINCT FROM "operSt"
      )
  `
}

export async function queryStateChangedInterfaceIds(
  execute: StateChangeQueryExecutor,
  apicHostId: string,
  windowStart: Date,
): Promise<string[]> {
  const rows = await execute(buildStateChangedInterfaceIdsQuery(apicHostId, windowStart))
  return rows.map(row => row.interfaceId)
}
```

In `page.tsx`, call the wrapper with
`query => prisma.$queryRaw<Array<{ interfaceId: string }>>(query)`. Replace the
dense Prisma `findMany` plus JavaScript grouping and remove
`findStateChangedInterfaceIds` once unused.

- [ ] **Step 4: Run focused tests, build, and inspect query typing**

Run: `bun test 'src/app/(app)/interface-health/state-change-query.test.ts' 'src/app/(app)/interface-health/state-changes.test.ts' && bun run build`
Expected: tests and production build pass.

- [ ] **Step 5: Commit the scalable query**

```bash
git add 'src/app/(app)/interface-health/state-change-query.ts' \
  'src/app/(app)/interface-health/state-change-query.test.ts' \
  'src/app/(app)/interface-health/state-changes.ts' \
  'src/app/(app)/interface-health/state-changes.test.ts' \
  'src/app/(app)/interface-health/page.tsx'
git commit -m "perf(interface-health): detect state transitions in postgres"
```

### Task 5: Final cleanup and verification

**Files:**
- Modify: any PR file still reported by changed-file ESLint or `git diff --check`

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: merge-ready PR branch verification evidence.

- [ ] **Step 1: Remove remaining unused imports and whitespace errors**

Delete the unused `StatusHistorySample` and `IconLoader` imports if still
reported. Remove the trailing spaces in the drawer.

- [ ] **Step 2: Run all tests**

Run: `bun test`
Expected: all tests pass with zero failures.

- [ ] **Step 3: Run changed-file lint and whitespace validation**

Run: `bunx eslint src/actions/interface-samples.ts 'src/app/(app)/interface-health/'{InterfaceErrorTrendDrawer.tsx,InterfaceHealthClient.tsx,page.tsx,state-changes.ts,state-changes.test.ts,status-samples.test.ts,interface-query.ts,interface-query.test.ts,drawer-request-state.ts,drawer-request-state.test.ts,state-change-query.ts,state-change-query.test.ts} && git diff --check origin/main...HEAD`
Expected: exit 0 with no errors.

- [ ] **Step 4: Run the production build**

Run: `bun run build`
Expected: compile, TypeScript, page generation, and route collection succeed.

- [ ] **Step 5: Review the complete diff and commit cleanup if needed**

```bash
git diff --stat origin/main...HEAD
git diff --check origin/main...HEAD
git status --short
git add src/actions/interface-samples.ts \
  'src/app/(app)/interface-health/InterfaceErrorTrendDrawer.tsx' \
  'src/app/(app)/interface-health/InterfaceHealthClient.tsx'
git commit -m "chore(interface-health): clean state tracking changes"
```

Skip the cleanup commit when Step 1 produces no file changes.
