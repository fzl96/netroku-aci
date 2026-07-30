# History Server Query Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make History search, action filtering, and pagination query the complete audit table through URL parameters, with a Suspense-backed results skeleton.

**Architecture:** Pure helpers parse the History URL state, build the Prisma filter, generate canonical URLs, and clamp pages. The authenticated route renders persistent client-side controls outside a keyed Suspense boundary; an async server results component performs the count-then-page query and renders the interactive current-page table.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma 6/PostgreSQL, Bun test, Tailwind CSS.

## Global Constraints

- Work on a feature branch created through the repository-isolation workflow.
- URL parameters are optional `query`, `action`, and `page`; omit empty/default values.
- Search input state updates immediately; only `router.replace` is debounced by 300 ms.
- Changing `query` or `action` resets `page` to `1`; pagination preserves active filters.
- Fetch 20 audit rows per page and never cap the stored or searchable history.
- Keep search and filter controls outside Suspense; skeletonize only count, table, and pagination.
- Preserve payload expansion and CSV export behavior.
- Add no new runtime or test dependencies.

---

### Task 1: History Query and URL Helpers

**Files:**
- Create: `src/lib/history/query.ts`
- Create: `src/lib/history/query.test.ts`
- Modify: `src/app/(app)/history/HistoryClient.tsx`

**Interfaces:**
- Produces: `HISTORY_PAGE_SIZE`, `HISTORY_ACTION_LABELS`, `HistoryActionFilter`, `HistoryPageParams`, `parseHistoryPageParams(input)`, `buildHistoryWhere(params)`, `clampHistoryPage(page, total)`, and `buildHistoryUrl(params)`.
- Consumes: `AuditAction` from `src/lib/audit.ts` and Prisma's `AuditLogWhereInput` type.

- [ ] **Step 1: Write failing parsing and URL tests**

Create `src/lib/history/query.test.ts` with:

```ts
import { describe, expect, it } from 'bun:test'
import {
  buildHistoryUrl,
  clampHistoryPage,
  parseHistoryPageParams,
} from './query'

describe('parseHistoryPageParams', () => {
  it('trims query and accepts a supported action and positive page', () => {
    expect(parseHistoryPageParams({
      query: '  switch  ',
      action: 'resync.interfaces',
      page: '3',
    })).toEqual({
      query: 'switch',
      action: 'resync.interfaces',
      page: 3,
    })
  })

  it('falls back for invalid actions and pages', () => {
    expect(parseHistoryPageParams({
      action: 'not-supported',
      page: '-4',
    })).toEqual({ query: '', action: 'all', page: 1 })
  })
})

describe('buildHistoryUrl', () => {
  it('omits defaults and preserves active filters while paging', () => {
    expect(buildHistoryUrl({ query: '', action: 'all', page: 1 })).toBe('/history')
    expect(buildHistoryUrl({
      query: '  admin  ',
      action: 'user.create',
      page: 2,
    })).toBe('/history?query=admin&action=user.create&page=2')
  })
})

describe('clampHistoryPage', () => {
  it('clamps the requested page to the matching result bounds', () => {
    expect(clampHistoryPage(8, 41)).toBe(3)
    expect(clampHistoryPage(2, 0)).toBe(1)
  })
})
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `bun test src/lib/history/query.test.ts`

Expected: FAIL because `./query` does not exist.

- [ ] **Step 3: Add failing Prisma-filter tests**

Extend the test file:

```ts
import { buildHistoryWhere } from './query'

describe('buildHistoryWhere', () => {
  it('searches text fields and matching human-readable action labels', () => {
    expect(buildHistoryWhere({ query: 'host add', action: 'all', page: 1 })).toEqual({
      OR: [
        { userName: { contains: 'host add', mode: 'insensitive' } },
        { target: { contains: 'host add', mode: 'insensitive' } },
        { detail: { contains: 'host add', mode: 'insensitive' } },
        { action: { in: ['apic_host.create'] } },
      ],
    })
  })

  it('combines an exact action filter with free-text search', () => {
    expect(buildHistoryWhere({
      query: 'failed',
      action: 'resync.interfaces',
      page: 1,
    })).toEqual({
      action: 'resync.interfaces',
      OR: [
        { userName: { contains: 'failed', mode: 'insensitive' } },
        { target: { contains: 'failed', mode: 'insensitive' } },
        { detail: { contains: 'failed', mode: 'insensitive' } },
      ],
    })
  })
})
```

- [ ] **Step 4: Implement the minimal pure helpers**

Create `src/lib/history/query.ts` with:

```ts
import type { Prisma } from '@prisma/client'
import type { AuditAction } from '@/lib/audit'

export const HISTORY_PAGE_SIZE = 20

export const HISTORY_ACTION_LABELS: Record<AuditAction, string> = {
  'apic_host.create': 'Host added',
  'apic_host.update': 'Host updated',
  'apic_host.delete': 'Host deleted',
  deploy: 'Deploy',
  rollback: 'Rollback',
  'resync.endpoints': 'Resync endpoints',
  'resync.interfaces': 'Resync interfaces',
  'resync.faults': 'Resync faults',
  'resync.health': 'Resync health',
  'resync.nodes': 'Resync nodes',
  'resync.epgs': 'Resync EPGs',
  'ingest.legacy.health': 'Ingest legacy health',
  'ingest.legacy.interfaces': 'Ingest legacy interfaces',
  'ingest.legacy.endpoints': 'Ingest legacy endpoints',
  'user.create': 'User created',
  'user.delete': 'User deleted',
}

const HISTORY_ACTIONS = Object.keys(HISTORY_ACTION_LABELS) as AuditAction[]

export type HistoryActionFilter = AuditAction | 'all'
export type HistoryPageParams = {
  query: string
  action: HistoryActionFilter
  page: number
}

export function parseHistoryPageParams(input: {
  query?: string
  action?: string
  page?: string
}): HistoryPageParams {
  const parsedPage = Number.parseInt(input.page ?? '1', 10)
  return {
    query: input.query?.trim() ?? '',
    action: HISTORY_ACTIONS.includes(input.action as AuditAction)
      ? input.action as AuditAction
      : 'all',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

export function buildHistoryWhere(
  params: HistoryPageParams,
): Prisma.AuditLogWhereInput {
  const matchingActions = params.query
    ? HISTORY_ACTIONS.filter(action =>
        HISTORY_ACTION_LABELS[action].toLowerCase().includes(params.query.toLowerCase()))
    : []

  return {
    ...(params.action !== 'all' ? { action: params.action } : {}),
    ...(params.query
      ? {
          OR: [
            { userName: { contains: params.query, mode: 'insensitive' } },
            { target: { contains: params.query, mode: 'insensitive' } },
            { detail: { contains: params.query, mode: 'insensitive' } },
            ...(matchingActions.length > 0
              ? [{ action: { in: matchingActions } }]
              : []),
          ],
        }
      : {}),
  }
}

export function clampHistoryPage(page: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

export function buildHistoryUrl(params: HistoryPageParams): string {
  const search = new URLSearchParams()
  if (params.query.trim()) search.set('query', params.query.trim())
  if (params.action !== 'all') search.set('action', params.action)
  if (params.page > 1) search.set('page', String(params.page))
  const queryString = search.toString()
  return `/history${queryString ? `?${queryString}` : ''}`
}
```

Move the action-label lookup in `HistoryClient.tsx` to import
`HISTORY_ACTION_LABELS` so labels have one source of truth.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run: `bun test src/lib/history/query.test.ts`

Expected: all History query tests PASS.

- [ ] **Step 6: Commit the helper layer**

```bash
git add src/lib/history/query.ts src/lib/history/query.test.ts src/app/\\(app\\)/history/HistoryClient.tsx
git commit -m "feat: add history URL query helpers"
```

---

### Task 2: Complete-Table Server Pagination

**Files:**
- Modify: `src/actions/audit.ts`
- Modify: `src/lib/history/query.test.ts`

**Interfaces:**
- Consumes: `HistoryPageParams`, `buildHistoryWhere`, `clampHistoryPage`, and `HISTORY_PAGE_SIZE`.
- Produces: `AuditLogPage` and `getAuditLogPage(params): Promise<AuditLogPage>`.

- [ ] **Step 1: Add a failing page-window test**

Add `historyPageWindow` to the imports and append:

```ts
describe('historyPageWindow', () => {
  it('returns the clamped page, skip, and fixed take', () => {
    expect(historyPageWindow(9, 41)).toEqual({
      page: 3,
      skip: 40,
      take: 20,
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/lib/history/query.test.ts`

Expected: FAIL because `historyPageWindow` is not exported.

- [ ] **Step 3: Implement and use the page window**

Add to `src/lib/history/query.ts`:

```ts
export function historyPageWindow(page: number, total: number) {
  const effectivePage = clampHistoryPage(page, total)
  return {
    page: effectivePage,
    skip: (effectivePage - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
  }
}
```

Replace `getAuditLogs()` in `src/actions/audit.ts` with:

```ts
export type AuditLogPage = {
  logs: AuditLogEntry[]
  total: number
  page: number
}

export async function getAuditLogPage(
  params: HistoryPageParams,
): Promise<AuditLogPage> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')

  const where = buildHistoryWhere(params)
  const total = await prisma.auditLog.count({ where })
  const window = historyPageWindow(params.page, total)
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: window.skip,
    take: window.take,
  })

  return {
    logs: logs.map(serializeAuditLog),
    total,
    page: window.page,
  }
}
```

Extract the existing log mapping body into a private `serializeAuditLog`
function with return type `AuditLogEntry`; preserve Date and payload semantics.
Delete `MAX_LOGS`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `bun test src/lib/history/query.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Type-check the server action**

Run: `bunx tsc --noEmit`

Expected: PASS with no TypeScript errors.

- [ ] **Step 6: Commit server pagination**

```bash
git add src/actions/audit.ts src/lib/history/query.ts src/lib/history/query.test.ts
git commit -m "feat: paginate complete audit history"
```

---

### Task 3: URL Controls, Suspense Results, and Skeleton

**Files:**
- Modify: `src/app/(app)/history/page.tsx`
- Create: `src/app/(app)/history/HistoryControls.tsx`
- Create: `src/app/(app)/history/HistoryResults.tsx`
- Create: `src/app/(app)/history/HistoryResultsClient.tsx`
- Create: `src/app/(app)/history/HistoryResultsSkeleton.tsx`
- Delete: `src/app/(app)/history/HistoryClient.tsx`

**Interfaces:**
- `HistoryControls({ query, action })` owns immediate input state and URL navigation.
- `HistoryResults({ params })` is the async server component that calls `getAuditLogPage`.
- `HistoryResultsClient({ logs, total, page, query, action })` owns row expansion, CSV export, and URL pagination.
- `HistoryResultsSkeleton()` renders the result-region fallback only.

- [ ] **Step 1: Extract the persistent controls client**

Create `HistoryControls.tsx` using `useRouter`, `useTransition`, `useRef`, and
`useState`. Preserve the existing search/select styling. Implement:

```ts
function handleSearchChange(value: string) {
  setSearchValue(value)
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    setLastDispatchedQuery(value.trim())
    startTransition(() => {
      router.replace(buildHistoryUrl({
        query: value,
        action,
        page: 1,
      }))
    })
  }, 300)
}

function handleActionChange(nextAction: HistoryActionFilter) {
  startTransition(() => {
    router.replace(buildHistoryUrl({
      query,
      action: nextAction,
      page: 1,
    }))
  })
}
```

Mirror the existing monitoring-page synchronization guard: track
`previousQuery` and `lastDispatchedQuery`, update the visible input for
back/forward navigation, and do not overwrite newer typing when the component
receives the echo from its own debounced navigation. Clear the timeout on
unmount.

- [ ] **Step 2: Extract current-page results behavior**

Create `HistoryResultsClient.tsx` from the current table, empty state, expanded
payload row, CSV download, and previous/next controls. Remove all in-memory
search/filter/slicing. Compute:

```ts
const totalPages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE))
```

Navigate pages with:

```ts
router.replace(buildHistoryUrl({
  query,
  action,
  page: nextPage,
}))
```

Display the global matching count and render every supplied `logs` row because
the server already selected the page.

- [ ] **Step 3: Add the async results boundary and fallback**

Create `HistoryResults.tsx`:

```tsx
import { getAuditLogPage } from '@/actions/audit'
import type { HistoryPageParams } from '@/lib/history/query'
import { HistoryResultsClient } from './HistoryResultsClient'

export async function HistoryResults({ params }: { params: HistoryPageParams }) {
  const result = await getAuditLogPage(params)
  return <HistoryResultsClient {...result} query={params.query} action={params.action} />
}
```

Create `HistoryResultsSkeleton.tsx` using `Skeleton` from
`@/components/ui/skeleton`. Match the normal results region with a count line,
six-column header, eight skeleton rows, and pagination placeholders. Add
`aria-label="Loading history"` and `aria-busy="true"` to the wrapper.

- [ ] **Step 4: Compose the authenticated page**

Update `page.tsx` to parse URL state and render:

```tsx
const params = parseHistoryPageParams(await searchParams)
const suspenseKey = `${params.query}:${params.action}:${params.page}`

return (
  <HistoryPageShell>
    <HistoryControls query={params.query} action={params.action} />
    <Suspense key={suspenseKey} fallback={<HistoryResultsSkeleton />}>
      <HistoryResults params={params} />
    </Suspense>
  </HistoryPageShell>
)
```

Keep the existing heading/copy directly in `page.tsx` rather than introducing
an extra `HistoryPageShell` component; the snippet names the visual region.
Delete `HistoryClient.tsx` after all behavior has moved.

- [ ] **Step 5: Run focused and full automated checks**

Run:

```bash
bun test src/lib/history/query.test.ts src/app/\\(app\\)/history/export-utils.test.ts
bunx tsc --noEmit
bun run lint
```

Expected: all commands PASS without new warnings.

- [ ] **Step 6: Commit the UI and Suspense integration**

```bash
git add src/app/\\(app\\)/history
git commit -m "feat: stream server-filtered history results"
```

---

### Task 4: Production and Browser Verification

**Files:**
- Modify only if verification exposes an implementation defect.

**Interfaces:**
- Verifies the complete `/history` URL contract and loading behavior.

- [ ] **Step 1: Run the complete test suite**

Run: `bun test`

Expected: all tests PASS.

- [ ] **Step 2: Run a production build**

Run: `bun run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 3: Verify in the in-app browser**

Start the development server, attach the product-native preview, and verify:

- typing is immediate while `query` appears in the URL after roughly 300 ms;
- action changes update `action` and reset `page`;
- next/previous updates `page` while retaining active filters;
- refreshing and browser back/forward restore all controls;
- the results skeleton appears without replacing the controls;
- payload expansion and CSV export still work on the current page;
- invalid `page` and `action` values render a valid result state.

- [ ] **Step 4: Review the final diff**

Run:

```bash
git diff main...HEAD --check
git diff main...HEAD --stat
git status --short
```

Expected: no whitespace errors, only scoped History/spec/plan changes, and a
clean worktree.

- [ ] **Step 5: Commit any verification fixes**

If verification required changes, stage only those files and commit:

```bash
git status --short
git add src/actions/audit.ts src/lib/history src/app/\\(app\\)/history
git commit -m "fix: polish server-driven history navigation"
```

If no changes were required, do not create an empty commit.
