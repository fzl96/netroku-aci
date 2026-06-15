# Dashboard Command Center Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign `/dashboard` into a global ACI operations command center covering endpoints, interfaces, faults, health scores, nodes, and hardware.

**Architecture:** Keep `/dashboard` as a server-rendered Next page. Add a small dashboard summary module with pure helpers for posture, freshness, attention ordering, and data formatting, then have the page fetch Prisma aggregates and render the modern dashboard from those summaries. Keep links into existing detail pages instead of adding client-side filtering or new APIC sync behavior.

**Tech Stack:** Next.js 16 App Router, React 19 server components, Prisma 6 with SQLite, Tailwind CSS v4, Tabler icons, Bun test.

---

### Task 1: Add Dashboard Summary Helper Tests

**Files:**
- Create: `src/app/(app)/dashboard/summary.test.ts`
- Later modify: `src/app/(app)/dashboard/summary.ts`

**Step 1: Write the failing tests**

Create `src/app/(app)/dashboard/summary.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import {
  buildAttentionItems,
  classifyPosture,
  formatRelativeFreshness,
} from './summary'

describe('classifyPosture', () => {
  test('returns critical when critical faults exist', () => {
    expect(classifyPosture({ criticalFaults: 1, majorFaults: 0, failedHardware: 0, worstHealthScore: 100, offlineNodes: 0, noisyInterfaces: 0 }).tone).toBe('critical')
  })

  test('returns warning for degraded health without critical blockers', () => {
    expect(classifyPosture({ criticalFaults: 0, majorFaults: 1, failedHardware: 0, worstHealthScore: 78, offlineNodes: 0, noisyInterfaces: 0 }).tone).toBe('warning')
  })

  test('returns healthy when no risk signals are present', () => {
    expect(classifyPosture({ criticalFaults: 0, majorFaults: 0, failedHardware: 0, worstHealthScore: 96, offlineNodes: 0, noisyInterfaces: 0 }).tone).toBe('healthy')
  })
})

describe('buildAttentionItems', () => {
  test('orders the most severe risks first and omits zero-count items', () => {
    const items = buildAttentionItems({
      criticalFaults: 2,
      majorFaults: 5,
      failedHardware: 1,
      offlineNodes: 0,
      degradedHealthObjects: 3,
      noisyInterfaces: 4,
      downInterfaces: 0,
    })

    expect(items.map(item => item.key)).toEqual([
      'critical-faults',
      'failed-hardware',
      'major-faults',
      'degraded-health',
      'interface-errors',
    ])
  })
})

describe('formatRelativeFreshness', () => {
  test('formats never-synced timestamps neutrally', () => {
    expect(formatRelativeFreshness(null, new Date('2026-06-15T12:00:00Z'))).toBe('Never synced')
  })

  test('formats recent timestamps in minutes', () => {
    expect(formatRelativeFreshness('2026-06-15T11:45:00Z', new Date('2026-06-15T12:00:00Z'))).toBe('15m ago')
  })

  test('formats older timestamps in hours', () => {
    expect(formatRelativeFreshness('2026-06-15T03:00:00Z', new Date('2026-06-15T12:00:00Z'))).toBe('9h ago')
  })
})
```

**Step 2: Run the tests to verify they fail**

Run:

```bash
bun test src/app/'(app)'/dashboard/summary.test.ts
```

Expected: FAIL because `./summary` does not exist.

**Step 3: Commit**

Do not commit yet; commit after Task 2 makes these tests pass.

### Task 2: Implement Pure Summary Helpers

**Files:**
- Create: `src/app/(app)/dashboard/summary.ts`
- Test: `src/app/(app)/dashboard/summary.test.ts`

**Step 1: Implement the helper module**

Create `src/app/(app)/dashboard/summary.ts`:

```ts
export type PostureTone = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface PostureInput {
  criticalFaults: number
  majorFaults: number
  failedHardware: number
  worstHealthScore: number | null
  offlineNodes: number
  noisyInterfaces: number
}

export interface PostureResult {
  tone: PostureTone
  label: string
  detail: string
}

export function classifyPosture(input: PostureInput): PostureResult {
  if (
    input.criticalFaults > 0 ||
    input.failedHardware > 0 ||
    input.offlineNodes > 0 ||
    (input.worstHealthScore !== null && input.worstHealthScore < 70)
  ) {
    return { tone: 'critical', label: 'Needs attention', detail: 'Critical risk signals are active' }
  }

  if (
    input.majorFaults > 0 ||
    input.noisyInterfaces > 0 ||
    (input.worstHealthScore !== null && input.worstHealthScore < 90)
  ) {
    return { tone: 'warning', label: 'Degraded', detail: 'Review warnings before changes' }
  }

  if (input.worstHealthScore === null) {
    return { tone: 'unknown', label: 'No health data', detail: 'Sync health scores to complete posture' }
  }

  return { tone: 'healthy', label: 'Stable', detail: 'No immediate risk signals detected' }
}

export interface AttentionInput {
  criticalFaults: number
  majorFaults: number
  failedHardware: number
  offlineNodes: number
  degradedHealthObjects: number
  noisyInterfaces: number
  downInterfaces: number
}

export interface AttentionItem {
  key: string
  label: string
  detail: string
  count: number
  tone: Exclude<PostureTone, 'unknown'>
  href: string
  rank: number
}

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [
    {
      key: 'critical-faults',
      label: 'Critical faults',
      detail: 'Active critical fabric faults',
      count: input.criticalFaults,
      tone: 'critical',
      href: '/faults?severity=critical',
      rank: 10,
    },
    {
      key: 'failed-hardware',
      label: 'Failed hardware',
      detail: 'PSU or fan components reporting failed state',
      count: input.failedHardware,
      tone: 'critical',
      href: '/nodes?view=components',
      rank: 20,
    },
    {
      key: 'offline-nodes',
      label: 'Offline nodes',
      detail: 'Fabric nodes not reporting active state',
      count: input.offlineNodes,
      tone: 'critical',
      href: '/nodes',
      rank: 30,
    },
    {
      key: 'major-faults',
      label: 'Major faults',
      detail: 'Active major fabric faults',
      count: input.majorFaults,
      tone: 'warning',
      href: '/faults?severity=major',
      rank: 40,
    },
    {
      key: 'degraded-health',
      label: 'Degraded health objects',
      detail: 'Node or tenant health below 90',
      count: input.degradedHealthObjects,
      tone: 'warning',
      href: '/health-scores',
      rank: 50,
    },
    {
      key: 'interface-errors',
      label: 'Interfaces with errors',
      detail: 'Latest sample includes error or discard deltas',
      count: input.noisyInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 60,
    },
    {
      key: 'down-interfaces',
      label: 'Operationally down interfaces',
      detail: 'Interfaces with oper state down',
      count: input.downInterfaces,
      tone: 'warning',
      href: '/interface-health',
      rank: 70,
    },
  ]

  return items
    .filter(item => item.count > 0)
    .sort((a, b) => a.rank - b.rank)
}

export function formatRelativeFreshness(value: string | Date | null, now = new Date()): string {
  if (!value) return 'Never synced'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Never synced'

  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 48) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}
```

**Step 2: Run the focused test**

Run:

```bash
bun test src/app/'(app)'/dashboard/summary.test.ts
```

Expected: PASS.

**Step 3: Commit**

Run:

```bash
git add src/app/'(app)'/dashboard/summary.ts src/app/'(app)'/dashboard/summary.test.ts
git commit -m "test: add dashboard summary helpers"
```

### Task 3: Replace Dashboard Tiles With Global Aggregation

**Files:**
- Modify: `src/app/(app)/dashboard/page.tsx`
- May delete or leave unused: `src/app/(app)/dashboard/FaultsTile.tsx`
- May delete or leave unused: `src/app/(app)/dashboard/HealthTile.tsx`
- May delete or leave unused: `src/app/(app)/dashboard/NodesTile.tsx`

**Step 1: Add dashboard data loading in `page.tsx`**

In `src/app/(app)/dashboard/page.tsx`:

- Import `redirect`, `headers`, `auth`, `prisma`, and helper functions from `./summary`.
- Guard the page with the same session check used by detail pages.
- Load APIC hosts and aggregate data with `Promise.all`.
- For interface risk, fetch all interface snapshots with their latest sample:

```ts
const interfaces = await prisma.interfaceSnapshot.findMany({
  select: {
    adminSt: true,
    operSt: true,
    samples: {
      orderBy: { sampledAt: 'desc' },
      take: 1,
      select: {
        dRxErrors: true,
        dTxErrors: true,
        dRxDiscards: true,
        dTxDiscards: true,
        dRxCrcErrors: true,
        dRxAlignErrors: true,
      },
    },
  },
})
```

- Count a noisy interface when any latest delta field is greater than `0`.
- Count degraded health objects as present `node` or `tenant` scores below `90`.
- Build `posture` and `attentionItems` through the helper functions.

**Step 2: Render the command center UI**

Replace the old three-tile grid with:

- Header: title, subtitle, and small host count/sync freshness badges.
- Large posture section:
  - left side: posture label, detail, worst health score.
  - right side: six compact stats for critical faults, major faults, online nodes, failed hardware, active endpoints, and noisy interfaces.
- Metric grid:
  - Endpoints card linking to `/endpoints`.
  - Interfaces card linking to `/interface-health`.
  - Faults card linking to `/faults`.
  - Health card linking to `/health-scores`.
  - Nodes & Hardware card linking to `/nodes`.
- Lower two-column section:
  - Attention required list.
  - APIC host coverage table with host name, target, and latest sync freshness.

Use existing tokens: `bg-background`, `bg-card`, `border-border`, `text-subtle`, `text-muted-foreground`, `text-success`, `text-warning`, `text-error`. Use Tabler icons already available in the project.

**Step 3: Remove unused imports**

Remove imports for `FaultsTile`, `HealthTile`, and `NodesTile` from `page.tsx`. Do not delete the tile files unless lint reports they are a problem.

**Step 4: Run lint**

Run:

```bash
bun run lint
```

Expected: PASS.

**Step 5: Commit**

Run:

```bash
git add src/app/'(app)'/dashboard/page.tsx
git commit -m "feat: redesign dashboard overview"
```

### Task 4: Verify Build And Dashboard Rendering

**Files:**
- No planned edits unless verification reveals a concrete issue.

**Step 1: Run all tests**

Run:

```bash
bun test
```

Expected: PASS.

**Step 2: Run production build**

Run:

```bash
bun run build
```

Expected: PASS.

**Step 3: Start local dev server for manual review**

Run:

```bash
bun run dev
```

Expected: server starts, normally on `http://localhost:3000`.

**Step 4: Review `/dashboard`**

Open `/dashboard` in the running app and check:

- The first viewport clearly communicates global posture.
- Text does not overflow on desktop or mobile widths.
- Cards link to the expected detail pages.
- Empty or unsynced data renders neutrally.
- Light and dark theme both remain legible.

**Step 5: Commit any verification fixes**

If manual review requires fixes, commit them separately:

```bash
git add src/app/'(app)'/dashboard/page.tsx
git commit -m "fix: polish dashboard overview"
```

### Task 5: Final Status

**Step 1: Confirm git status**

Run:

```bash
git status --short
```

Expected: only intentional files changed, or clean if all commits were made.

**Step 2: Summarize evidence**

Final response should mention:

- The redesigned dashboard files.
- Test/lint/build results.
- The local dev server URL if still running.
