# Faults Health Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect Cisco ACI fabric faults from APIC on the existing manual + scheduled resync flows, store them with history, and report them on a new `/faults` page (table + severity trend) plus a dashboard tile.

**Architecture:** Mirror the existing Interfaces collector pattern exactly — a `resyncFaults` lib (APIC login → `faultInst` class query → chunked upsert of a `FaultSnapshot` snapshot model + per-resync `FaultCountSample` rows for trends), a session-authed `POST /api/faults/resync` route, cron wiring in `/api/cron/resync`, and a server-component page reading SQLite with filters/pagination. Cleared faults are detected by absence from the live `faultInst` result set (like `Endpoint.isActive`).

**Tech Stack:** Next.js (App Router, server components), Prisma + SQLite, better-auth, recharts + shadcn chart primitives, bun test.

---

## File Structure

**Create:**

- `src/lib/apic/faults.ts` — fault types, `parseFaultRows`, `tallyFaultCounts`, `selectClearedDns`, `fetchFaultsFromApic`, `resyncFaults`
- `src/lib/apic/faults.test.ts` — parse / tally / cleared-detection unit tests
- `src/app/api/faults/resync/route.ts` — manual resync endpoint
- `src/app/(app)/faults/page.tsx` — server component (query + filters + pagination)
- `src/app/(app)/faults/FaultsClient.tsx` — table + severity trend + resync UI
- `src/app/(app)/faults/sort.ts` — severity ordering helper
- `src/app/(app)/faults/sort.test.ts` — sort tests
- `src/actions/faults.ts` — `getFaultCountSummary` server action for the dashboard tile
- `src/app/(app)/dashboard/FaultsTile.tsx` — dashboard summary tile

**Modify:**

- `prisma/schema.prisma` — add `FaultSnapshot`, `FaultCountSample`, `ApicHost.lastFaultSyncAt` + relations
- `src/lib/apic/client.ts` — extract shared `apicLogin` helper
- `src/lib/apic/interfaces.ts` — use `apicLogin`
- `src/lib/apic/endpoints.ts` — use `apicLogin`
- `src/lib/audit.ts` — add `'resync.faults'` action
- `src/lib/apic/cron-resync.ts` — add `faults` to `HostResult` + `summarizeResults`
- `src/lib/apic/cron-resync.test.ts` — cover the faults dataset
- `src/app/api/cron/resync/route.ts` — add the Faults dataset block
- `src/components/AppSidebar.tsx` — add the Faults nav entry
- `src/app/(app)/dashboard/page.tsx` — render `FaultsTile`

---

## Task 1: Prisma schema — fault models

**Files:**

- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `lastFaultSyncAt` and relations to `ApicHost`**

In the `ApicHost` model, add the field next to `lastInterfaceSyncAt` and the two back-relations next to `interfaces`:

```prisma
  lastInterfaceSyncAt DateTime?
  lastFaultSyncAt     DateTime?
  endpoints           Endpoint[]
  interfaces          InterfaceSnapshot[]
  faults              FaultSnapshot[]
  faultCounts         FaultCountSample[]
```

- [ ] **Step 2: Add the `FaultSnapshot` and `FaultCountSample` models**

Append after `InterfaceSample`:

```prisma
model FaultSnapshot {
  id             String    @id @default(cuid())
  apicHostId     String
  apicHost       ApicHost  @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn             String
  code           String
  severity       String
  domain         String    @default("")
  type           String    @default("")
  cause          String    @default("")
  affectedDn     String    @default("")
  node           String?
  descr          String    @default("")
  ack            Boolean   @default(false)
  created        DateTime?
  lastTransition DateTime?
  lifecycle      String    @default("active")
  firstSeenAt    DateTime  @default(now())
  lastSeenAt     DateTime  @default(now())
  clearedAt      DateTime?

  @@unique([apicHostId, dn])
  @@index([apicHostId])
  @@index([apicHostId, lifecycle])
  @@map("fault_snapshot")
}

model FaultCountSample {
  id         String   @id @default(cuid())
  apicHostId String
  apicHost   ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  sampledAt  DateTime @default(now())

  critical Int
  major    Int
  minor    Int
  warning  Int
  total    Int

  @@index([apicHostId, sampledAt])
  @@map("fault_count_sample")
}
```

- [ ] **Step 3: Create the migration and regenerate the client**

Run: `bunx prisma migrate dev --name add_faults`
Expected: a new folder under `prisma/migrations/` named `*_add_faults`, and "Generated Prisma Client" output.

- [ ] **Step 4: Verify the client compiles with the new types**

Run: `bunx tsc --noEmit`
Expected: no errors referencing `FaultSnapshot` / `FaultCountSample`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add FaultSnapshot and FaultCountSample models"
```

---

## Task 2: Extract shared `apicLogin` helper

`fetchInterfacesFromApic` and `resyncEndpoints` each re-implement the `aaaLogin` request + token extraction. Extract it so faults reuses it instead of adding a third copy.

**Files:**

- Modify: `src/lib/apic/client.ts`
- Modify: `src/lib/apic/interfaces.ts:~205-220` (the login block inside `fetchInterfacesFromApic`)
- Modify: `src/lib/apic/endpoints.ts` (its login block)

- [ ] **Step 1: Add `apicLogin` to `client.ts`**

Append to `src/lib/apic/client.ts`:

```typescript
/** Authenticate against APIC and return the session token (APIC-cookie value). */
export async function apicLogin(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<string> {
  const loginRes = await apicFetch(host, "/api/aaaLogin.json", {
    method: "POST",
    body: JSON.stringify({
      aaaUser: { attributes: { name: username, pwd: plaintextPassword } },
    }),
  });
  if (!loginRes.ok) throw new Error(`APIC authentication failed: ${loginRes.status}`);
  const loginData = (await loginRes.json()) as {
    imdata: Array<{ aaaLogin?: { attributes: { token: string } } }>;
  };
  const token = loginData.imdata[0]?.aaaLogin?.attributes?.token;
  if (!token) throw new Error("No token in APIC login response");
  return token;
}
```

- [ ] **Step 2: Use it in `fetchInterfacesFromApic`**

In `src/lib/apic/interfaces.ts`, replace the inline login block at the top of `fetchInterfacesFromApic` with:

```typescript
  const token = await apicLogin(host, username, plaintextPassword)
```

Add `apicLogin` to the existing import: `import { apicFetch, apicLogin } from './client'`.

- [ ] **Step 3: Use it in `resyncEndpoints`**

In `src/lib/apic/endpoints.ts`, replace its inline `aaaLogin` block with `const token = await apicLogin(host, username, password)` (match the local variable names already used there), and add `apicLogin` to its `./client` import.

- [ ] **Step 4: Verify existing tests + types still pass**

Run: `bun test src/lib/apic && bunx tsc --noEmit`
Expected: all existing tests pass; no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/client.ts src/lib/apic/interfaces.ts src/lib/apic/endpoints.ts
git commit -m "refactor: extract shared apicLogin helper"
```

---

## Task 3: Fault parsing — `parseFaultRows`

**Files:**

- Create: `src/lib/apic/faults.ts`
- Test: `src/lib/apic/faults.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/apic/faults.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { parseFaultRows, type FaultInstNode } from './faults'

describe('parseFaultRows', () => {
  it('maps a faultInst MO to a fault row', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394',
            code: 'F1394',
            severity: 'major',
            domain: 'access',
            type: 'operational',
            cause: 'threshold-crossed',
            descr: 'rx errors high',
            ack: 'no',
            created: '2026-06-14T10:00:00.000+00:00',
            lastTransition: '2026-06-14T10:05:00.000+00:00',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys/fault-F1394')
    expect(row.code).toBe('F1394')
    expect(row.severity).toBe('major')
    expect(row.affectedDn).toBe('topology/pod-1/node-101/sys/phys-[eth1/1]/phys')
    expect(row.node).toBe('101')
    expect(row.ack).toBe(false)
    expect(row.created).toEqual(new Date('2026-06-14T10:00:00.000+00:00'))
  })

  it('derives null node for non-topology affected DNs', () => {
    const imdata: FaultInstNode[] = [
      {
        faultInst: {
          attributes: {
            dn: 'uni/tn-TenantA/fault-F0467',
            code: 'F0467',
            severity: 'minor',
            ack: 'yes',
          },
        },
      },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.affectedDn).toBe('uni/tn-TenantA')
    expect(row.node).toBeNull()
    expect(row.ack).toBe(true)
  })

  it('tolerates missing optional fields', () => {
    const imdata: FaultInstNode[] = [
      { faultInst: { attributes: { dn: 'uni/fault-F1', code: 'F1', severity: 'warning' } } },
    ]
    const [row] = parseFaultRows(imdata)
    expect(row.domain).toBe('')
    expect(row.descr).toBe('')
    expect(row.created).toBeNull()
    expect(row.node).toBeNull()
  })

  it('skips entries without a faultInst body', () => {
    expect(parseFaultRows([{} as FaultInstNode])).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/faults.test.ts`
Expected: FAIL — cannot find module `./faults`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/apic/faults.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { apicLogin } from './client'
import { apicFetch } from './client'

export interface FaultInstAttrs {
  dn: string
  code: string
  severity: string
  domain?: string
  type?: string
  cause?: string
  descr?: string
  ack?: string
  created?: string
  lastTransition?: string
}

export interface FaultInstNode {
  faultInst?: { attributes: FaultInstAttrs }
}

export interface ApicFaultRow {
  dn: string
  code: string
  severity: string
  domain: string
  type: string
  cause: string
  affectedDn: string
  node: string | null
  descr: string
  ack: boolean
  created: Date | null
  lastTransition: Date | null
}

const NODE_RE = /topology\/pod-\d+\/node-(\d+)\b/

function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Strip the trailing `/fault-Fxxxx` RN to get the affected object's DN. */
function affectedDnFrom(dn: string): string {
  return dn.replace(/\/fault-[^/]+$/, '')
}

export function parseFaultRows(imdata: FaultInstNode[]): ApicFaultRow[] {
  const rows: ApicFaultRow[] = []
  for (const item of imdata) {
    const fault = item.faultInst
    if (!fault) continue
    const a = fault.attributes
    const affectedDn = affectedDnFrom(a.dn)
    const nodeMatch = NODE_RE.exec(affectedDn)
    rows.push({
      dn: a.dn,
      code: a.code,
      severity: a.severity,
      domain: a.domain ?? '',
      type: a.type ?? '',
      cause: a.cause ?? '',
      affectedDn,
      node: nodeMatch ? nodeMatch[1] : null,
      descr: a.descr ?? '',
      ack: a.ack === 'yes',
      created: parseDate(a.created),
      lastTransition: parseDate(a.lastTransition),
    })
  }
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/faults.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/faults.ts src/lib/apic/faults.test.ts
git commit -m "feat: add parseFaultRows fault parser"
```

---

## Task 4: Count tally + cleared-detection helpers

**Files:**

- Modify: `src/lib/apic/faults.ts`
- Test: `src/lib/apic/faults.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/apic/faults.test.ts`:

```typescript
import { tallyFaultCounts, selectClearedDns } from './faults'

describe('tallyFaultCounts', () => {
  it('counts rows by severity and totals them', () => {
    const rows = [
      { severity: 'critical' }, { severity: 'major' }, { severity: 'major' },
      { severity: 'minor' }, { severity: 'warning' }, { severity: 'unknown' },
    ] as Parameters<typeof tallyFaultCounts>[0]
    expect(tallyFaultCounts(rows)).toEqual({
      critical: 1, major: 2, minor: 1, warning: 1, total: 6,
    })
  })
})

describe('selectClearedDns', () => {
  it('returns previously-active DNs absent from the current set', () => {
    const previousActive = ['a/fault-F1', 'b/fault-F2', 'c/fault-F3']
    const currentDns = new Set(['b/fault-F2'])
    expect(selectClearedDns(previousActive, currentDns).sort()).toEqual(
      ['a/fault-F1', 'c/fault-F3'],
    )
  })

  it('returns empty when all previous faults are still present', () => {
    expect(selectClearedDns(['x'], new Set(['x']))).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/faults.test.ts`
Expected: FAIL — `tallyFaultCounts` / `selectClearedDns` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/apic/faults.ts`:

```typescript
export interface FaultCounts {
  critical: number
  major: number
  minor: number
  warning: number
  total: number
}

export function tallyFaultCounts(rows: Array<{ severity: string }>): FaultCounts {
  const counts: FaultCounts = { critical: 0, major: 0, minor: 0, warning: 0, total: 0 }
  for (const row of rows) {
    counts.total += 1
    if (row.severity === 'critical') counts.critical += 1
    else if (row.severity === 'major') counts.major += 1
    else if (row.severity === 'minor') counts.minor += 1
    else if (row.severity === 'warning') counts.warning += 1
  }
  return counts
}

/** Previously-active fault DNs that are absent from the current resync = cleared. */
export function selectClearedDns(previousActiveDns: string[], currentDns: Set<string>): string[] {
  return previousActiveDns.filter(dn => !currentDns.has(dn))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/faults.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/faults.ts src/lib/apic/faults.test.ts
git commit -m "feat: add fault count tally and cleared-detection helpers"
```

---

## Task 5: `fetchFaultsFromApic` + `resyncFaults`

These are the network/DB integration layer — kept thin since the testable logic is already covered. No new unit test (matches `interfaces.ts`, whose fetch/resync are untested integration code).

**Files:**

- Modify: `src/lib/apic/faults.ts`

- [ ] **Step 1: Add the fetch function**

Append to `src/lib/apic/faults.ts`:

```typescript
export async function fetchFaultsFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ApicFaultRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const path = '/api/node/class/faultInst.json'
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: FaultInstNode[] }
  return parseFaultRows(data.imdata ?? [])
}
```

- [ ] **Step 2: Add the resync function**

Append to `src/lib/apic/faults.ts`:

```typescript
const FAULTS_CHUNK_SIZE = 100

export interface ResyncFaultsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncFaultsResult extends FaultCounts {
  synced: number
  total: number
}

/**
 * Fetch active faults from APIC and persist them for one host.
 * Phase 1 upserts active FaultSnapshot rows; phase 2 flips previously-active
 * faults that vanished to `cleared`; phase 3 records a FaultCountSample.
 */
export async function resyncFaults(args: ResyncFaultsArgs): Promise<ResyncFaultsResult> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchFaultsFromApic(host, username, password)

  const deduped = new Map<string, ApicFaultRow>()
  for (const row of rows) if (row.dn) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values())
  const now = new Date()

  // Phase 1: upsert active faults (chunked so a huge fabric doesn't trip SQLite).
  for (let i = 0; i < uniqueRows.length; i += FAULTS_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + FAULTS_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.faultSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            code: row.code,
            severity: row.severity,
            domain: row.domain,
            type: row.type,
            cause: row.cause,
            affectedDn: row.affectedDn,
            node: row.node,
            descr: row.descr,
            ack: row.ack,
            created: row.created,
            lastTransition: row.lastTransition,
            lifecycle: 'active',
            clearedAt: null,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            code: row.code,
            severity: row.severity,
            domain: row.domain,
            type: row.type,
            cause: row.cause,
            affectedDn: row.affectedDn,
            node: row.node,
            descr: row.descr,
            ack: row.ack,
            created: row.created,
            lastTransition: row.lastTransition,
            lifecycle: 'active',
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  // Phase 2: flip previously-active faults that disappeared to cleared.
  const previouslyActive = await prisma.faultSnapshot.findMany({
    where: { apicHostId, lifecycle: 'active' },
    select: { dn: true },
  })
  const currentDns = new Set(uniqueRows.map(r => r.dn))
  const clearedDns = selectClearedDns(previouslyActive.map(f => f.dn), currentDns)
  if (clearedDns.length > 0) {
    await prisma.faultSnapshot.updateMany({
      where: { apicHostId, dn: { in: clearedDns } },
      data: { lifecycle: 'cleared', clearedAt: now },
    })
  }

  // Phase 3: record a severity-count sample for the trend.
  const counts = tallyFaultCounts(uniqueRows)
  await prisma.faultCountSample.create({
    data: { apicHostId, sampledAt: now, ...counts },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastFaultSyncAt: now },
  })

  const total = await prisma.faultSnapshot.count({ where: { apicHostId, lifecycle: 'active' } })
  return { synced: uniqueRows.length, total, ...counts }
}
```

- [ ] **Step 3: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/apic/faults.ts
git commit -m "feat: add fetchFaultsFromApic and resyncFaults"
```

---

## Task 6: Audit action

**Files:**

- Modify: `src/lib/audit.ts:4-13`

- [ ] **Step 1: Add the action to the union**

In the `AuditAction` union, add after `'resync.interfaces'`:

```typescript
  | 'resync.faults'
```

- [ ] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: add resync.faults audit action"
```

---

## Task 7: `POST /api/faults/resync` route

**Files:**

- Create: `src/app/api/faults/resync/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/faults/resync/route.ts` (mirrors `src/app/api/interfaces/resync/route.ts`):

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncFaults } from '@/lib/apic/faults'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let apicHostId: string
  let username: string
  let password: string
  try {
    ;({ apicHostId, username, password } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!apicHostId) return Response.json({ error: 'apicHostId is required' }, { status: 400 })
  if (!username?.trim() || !password) {
    return Response.json({ error: 'username and password are required' }, { status: 400 })
  }

  const apicHost = await prisma.apicHost.findFirst({ where: { id: apicHostId } })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  let result
  try {
    result = await resyncFaults({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch faults from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.faults',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.synced} (total ${result.total})`,
  })

  return Response.json(result)
}
```

- [ ] **Step 2: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/faults/resync/route.ts
git commit -m "feat: add POST /api/faults/resync route"
```

---

## Task 8: Cron-resync summary support

**Files:**

- Modify: `src/lib/apic/cron-resync.ts`
- Test: `src/lib/apic/cron-resync.test.ts`

- [ ] **Step 1: Add a failing test**

Append a test to `src/lib/apic/cron-resync.test.ts` (match the existing `summarizeResults` describe block style):

```typescript
import { describe, expect, it } from 'bun:test'
import { summarizeResults, type HostResult } from './cron-resync'

describe('summarizeResults with faults dataset', () => {
  it('counts the faults dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        faults: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})
```

> If `cron-resync.test.ts` already imports `summarizeResults`/`HostResult`, drop the duplicate import line and just add the `describe` block.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: FAIL — `faults` is not a known property of `HostResult` (type error) or assertion fails.

- [ ] **Step 3: Add `faults` to `HostResult` and the summary loop**

In `src/lib/apic/cron-resync.ts`, add to `HostResult`:

```typescript
  faults?: DatasetResult
```

And in `summarizeResults`, extend the dataset loop:

```typescript
    for (const d of [r.endpoints, r.interfaces, r.faults]) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/cron-resync.ts src/lib/apic/cron-resync.test.ts
git commit -m "feat: track faults dataset in cron resync summary"
```

---

## Task 9: Cron route wiring

**Files:**

- Modify: `src/app/api/cron/resync/route.ts`

- [ ] **Step 1: Import `resyncFaults`**

Add to the imports at the top:

```typescript
import { resyncFaults } from '@/lib/apic/faults'
```

- [ ] **Step 2: Add the Faults dataset block**

After the Interfaces block (right before `results.push(result)`), add:

```typescript
    // Faults
    let faults: DatasetResult
    try {
      faults = await resyncFaults({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      faults = { error: errorMessage(err, 'Failed to resync faults') }
    }
    result.faults = faults
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.faults',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in faults ? 'failure' : 'success',
      detail: 'error' in faults
        ? faults.error
        : `synced ${faults.synced} (total ${faults.total})`,
    })
```

> Note: `resyncFaults` returns extra severity fields, but assigning it to `DatasetResult` (a `{ synced, total }` superset) is structurally valid — `result.faults` only needs `synced`/`total`/`error`.

- [ ] **Step 3: Verify types compile**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/resync/route.ts
git commit -m "feat: resync faults in scheduled cron job"
```

---

## Task 10: Faults page sort helper

**Files:**

- Create: `src/app/(app)/faults/sort.ts`
- Test: `src/app/(app)/faults/sort.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/faults/sort.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { sortFaultRows } from './sort'

describe('sortFaultRows', () => {
  it('orders by severity critical > major > minor > warning', () => {
    const rows = [
      { severity: 'minor', code: 'F3' },
      { severity: 'critical', code: 'F1' },
      { severity: 'warning', code: 'F4' },
      { severity: 'major', code: 'F2' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F1', 'F2', 'F3', 'F4'])
  })

  it('breaks ties by code using natural order', () => {
    const rows = [
      { severity: 'major', code: 'F10' },
      { severity: 'major', code: 'F2' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F2', 'F10'])
  })

  it('sorts unknown severities last', () => {
    const rows = [
      { severity: 'weird', code: 'F9' },
      { severity: 'minor', code: 'F1' },
    ]
    expect(sortFaultRows(rows).map(r => r.code)).toEqual(['F1', 'F9'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "src/app/(app)/faults/sort.test.ts"`
Expected: FAIL — cannot find module `./sort`.

- [ ] **Step 3: Implement the sort helper**

Create `src/app/(app)/faults/sort.ts`:

```typescript
interface SortableFaultRow {
  severity: string
  code: string
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  warning: 3,
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function rank(severity: string): number {
  return SEVERITY_RANK[severity] ?? 99
}

export function sortFaultRows<T extends SortableFaultRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const sevOrder = rank(a.severity) - rank(b.severity)
    if (sevOrder !== 0) return sevOrder
    return NATURAL_COLLATOR.compare(a.code, b.code)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "src/app/(app)/faults/sort.test.ts"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/faults/sort.ts" "src/app/(app)/faults/sort.test.ts"
git commit -m "feat: add fault severity sort helper"
```

---

## Task 11: Faults page (server) + client

This mirrors the Interfaces page. **Open `src/app/(app)/interface-health/page.tsx` and `InterfaceHealthClient.tsx` as the template** — copy the host-selector, page-size parsing, search/pagination, and resync-credential-dialog scaffolding, then adapt the columns/filters/chart for faults. Reproducing the full ~700-line client here would be noise; the concrete fault-specific pieces are below.

**Files:**

- Create: `src/app/(app)/faults/page.tsx`
- Create: `src/app/(app)/faults/FaultsClient.tsx`

- [ ] **Step 1: Write the server component**

Create `src/app/(app)/faults/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { FaultsClient, type FaultRowProps } from './FaultsClient'
import { sortFaultRows } from './sort'

export const metadata: Metadata = {
  title: 'Faults',
  description: 'Active Cisco ACI fabric faults resynced from APIC, with severity trend.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_SEVERITIES = ['critical', 'major', 'minor', 'warning'] as const

export default async function FaultsPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    severity?: string
    node?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, severity, node, page: pageParam, pageSize: pageSizeParam } =
    await searchParams
  const apicHosts = await getApicHosts()

  const severityFilter = (VALID_SEVERITIES as readonly string[]).includes(severity ?? '')
    ? (severity as string)
    : undefined
  const nodeFilter = node ? node.split(',').map(s => s.trim()).filter(Boolean) : []
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let rows: FaultRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let availableNodes: string[] = []
  let trend: { sampledAt: string; critical: number; major: number; minor: number; warning: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastFaultSyncAt: true },
    })
    lastSyncedAt = host?.lastFaultSyncAt ?? null

    const where = {
      apicHostId: apic,
      lifecycle: 'active',
      ...(severityFilter ? { severity: severityFilter } : {}),
      ...(nodeFilter.length > 0 ? { node: { in: nodeFilter } } : {}),
      ...(query?.trim()
        ? {
            OR: [
              { code: { contains: query.trim() } },
              { descr: { contains: query.trim() } },
              { affectedDn: { contains: query.trim() } },
            ],
          }
        : {}),
    }

    total = await prisma.faultSnapshot.count({ where })

    const records = await prisma.faultSnapshot.findMany({
      where,
      ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    })
    rows = sortFaultRows(
      records.map(r => ({
        id: r.id,
        code: r.code,
        severity: r.severity,
        domain: r.domain,
        type: r.type,
        affectedDn: r.affectedDn,
        node: r.node,
        descr: r.descr,
        ack: r.ack,
        created: r.created ? r.created.toISOString() : null,
      })),
    )

    const nodes = await prisma.faultSnapshot.findMany({
      where: { apicHostId: apic, lifecycle: 'active', node: { not: null } },
      distinct: ['node'],
      select: { node: true },
    })
    availableNodes = nodes.map(n => n.node!).filter(Boolean)

    const samples = await prisma.faultCountSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, critical: true, major: true, minor: true, warning: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        critical: s.critical,
        major: s.major,
        minor: s.minor,
        warning: s.warning,
      }))
  }

  return (
    <FaultsClient
      apicHosts={apicHosts}
      selectedApic={apic ?? null}
      query={query ?? ''}
      severity={severityFilter ?? null}
      nodeFilter={nodeFilter}
      availableNodes={availableNodes}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      trend={trend}
    />
  )
}
```

- [ ] **Step 2: Write the client component**

Create `src/app/(app)/faults/FaultsClient.tsx`. Copy the scaffolding from `InterfaceHealthClient.tsx` (`'use client'`, host selector, search input with the debounced-URL-echo handling, page-size selector, pagination controls, and the resync credential dialog that POSTs to `/api/faults/resync`). Replace the interface-specific table and counter-mode UI with:

- **Props interface:**

```tsx
export interface FaultRowProps {
  id: string
  code: string
  severity: string
  domain: string
  type: string
  affectedDn: string
  node: string | null
  descr: string
  ack: boolean
  created: string | null
}
```

- **Severity badge** — map severity → color (critical: red, major: orange, minor: amber, warning: slate) using the project's badge/`cn` conventions seen in the other clients.
- **Table columns:** Severity (badge), Code, Affected (`node` if present else `affectedDn`), Domain, Description, Created (friendly date — reuse the same date formatting used in `InterfaceErrorTrendDrawer` tooltip), Ack.
- **Severity filter:** a select/toggle that sets the `severity` URL param (`critical|major|minor|warning|` for all), driving the same `router.push` pattern as the node filter on the interfaces page.
- **Severity trend chart** at the top using recharts + shadcn chart primitives (same imports as `InterfaceErrorTrendDrawer.tsx`):

```tsx
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const trendConfig: ChartConfig = {
  critical: { label: 'Critical', color: 'var(--chart-1)' },
  major: { label: 'Major', color: 'var(--chart-2)' },
  minor: { label: 'Minor', color: 'var(--chart-3)' },
  warning: { label: 'Warning', color: 'var(--chart-4)' },
}
```

Render one `<Line>` per severity over the `trend` prop (x = `sampledAt`, formatted like the drawer's friendly date). Hide the chart when `trend.length === 0`.

- **Resync button:** identical flow to the interfaces client — open the credential dialog, `fetch('/api/faults/resync', { method: 'POST', body: JSON.stringify({ apicHostId, username, password }) })`, then `router.refresh()`; surface errors inline.

- [ ] **Step 3: Verify types compile and lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 4: Manually verify the page renders**

Run: `bun dev`, sign in, open `http://localhost:3000/faults`, select a host. Expected: empty-state before a resync; after a resync (with valid APIC creds) the table and trend populate.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/faults/page.tsx" "src/app/(app)/faults/FaultsClient.tsx"
git commit -m "feat: add faults page with table and severity trend"
```

---

## Task 12: Sidebar navigation entry

**Files:**

- Modify: `src/components/AppSidebar.tsx` (after the Interfaces entry, ~line 106-109; imports ~line 61)

- [ ] **Step 1: Import the icon**

Add `IconAlertTriangle` to the `@tabler/icons-react` import block at the top of the file.

- [ ] **Step 2: Add the nav entry**

Immediately after the Interfaces entry (`href: "/interface-health"`), add:

```tsx
      {
        href: "/faults",
        label: "Faults",
        icon: <IconAlertTriangle size={15} stroke={1.75} />,
      },
```

- [ ] **Step 3: Verify it renders**

Run: `bunx tsc --noEmit`
Expected: no errors. (Visual check: the Faults link appears under Interfaces in the sidebar.)

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: add Faults sidebar navigation entry"
```

---

## Task 13: Dashboard faults tile

**Files:**

- Create: `src/actions/faults.ts`
- Create: `src/app/(app)/dashboard/FaultsTile.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Write the server action**

Create `src/actions/faults.ts`:

```typescript
'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface FaultTileHost {
  apicHostId: string
  name: string
  critical: number
  major: number
  minor: number
  warning: number
  spark: number[]
  lastSyncedAt: string | null
}

/** Latest active-fault severity counts + a recent total-fault sparkline per host. */
export async function getFaultCountSummary(): Promise<FaultTileHost[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []

  const hosts = await prisma.apicHost.findMany({
    select: { id: true, name: true, lastFaultSyncAt: true },
  })

  const summary: FaultTileHost[] = []
  for (const host of hosts) {
    const grouped = await prisma.faultSnapshot.groupBy({
      by: ['severity'],
      where: { apicHostId: host.id, lifecycle: 'active' },
      _count: { _all: true },
    })
    const bySeverity = (s: string) =>
      grouped.find(g => g.severity === s)?._count._all ?? 0

    const samples = await prisma.faultCountSample.findMany({
      where: { apicHostId: host.id },
      orderBy: { sampledAt: 'desc' },
      take: 20,
      select: { total: true },
    })

    summary.push({
      apicHostId: host.id,
      name: host.name,
      critical: bySeverity('critical'),
      major: bySeverity('major'),
      minor: bySeverity('minor'),
      warning: bySeverity('warning'),
      spark: samples.map(s => s.total).reverse(),
      lastSyncedAt: host.lastFaultSyncAt ? host.lastFaultSyncAt.toISOString() : null,
    })
  }
  return summary
}
```

- [ ] **Step 2: Write the tile component**

Create `src/app/(app)/dashboard/FaultsTile.tsx`:

```tsx
import Link from 'next/link'
import { IconAlertTriangle } from '@tabler/icons-react'
import { getFaultCountSummary } from '@/actions/faults'

export async function FaultsTile() {
  const summary = await getFaultCountSummary()
  const totals = summary.reduce(
    (acc, h) => ({
      critical: acc.critical + h.critical,
      major: acc.major + h.major,
      minor: acc.minor + h.minor,
    }),
    { critical: 0, major: 0, minor: 0 },
  )

  return (
    <Link
      href="/faults"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Faults</h3>
        <IconAlertTriangle size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className="text-2xl font-semibold text-red-600">{totals.critical}</span>
        <span className="text-lg font-semibold text-orange-500">{totals.major}</span>
        <span className="text-base font-medium text-amber-500">{totals.minor}</span>
      </div>
      <p className="text-xs text-subtle mt-1">critical / major / minor active faults</p>
    </Link>
  )
}
```

> The sparkline data (`spark`) is exposed for a future inline chart; the v1 tile keeps to counts. Keep `spark` in the action so the tile can adopt it without an action change.

- [ ] **Step 3: Render the tile on the dashboard**

In `src/app/(app)/dashboard/page.tsx`, replace the "Under construction" `<section>` body with a tile grid that includes `<FaultsTile />`:

```tsx
import { FaultsTile } from './FaultsTile'
```

```tsx
      <div className="px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FaultsTile />
        </div>
      </div>
```

- [ ] **Step 4: Verify types compile and page renders**

Run: `bunx tsc --noEmit`
Expected: no errors. Then `bun dev` → open `/dashboard` → the Faults tile shows aggregate counts and links to `/faults`.

- [ ] **Step 5: Commit**

```bash
git add src/actions/faults.ts "src/app/(app)/dashboard/FaultsTile.tsx" "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: add faults summary tile to dashboard"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `bun test`
Expected: all tests pass, including the new `faults.test.ts`, `sort.test.ts`, and updated `cron-resync.test.ts`.

- [ ] **Typecheck + lint the whole project**

Run: `bunx tsc --noEmit && bun run lint`
Expected: clean.

- [ ] **End-to-end smoke test**

With a reachable APIC host configured: trigger a manual resync from `/faults`, confirm the table + trend populate, confirm `/dashboard` shows the counts, and confirm `/api/cron/resync` includes a `faults` block in its response.

---

## Self-Review notes (addressed)

- **Spec coverage:** data model (Task 1), `apicLogin` extraction (Task 2), parse/tally/cleared helpers (Tasks 3–4), `resyncFaults` with cleared detection + count sample (Task 5), manual route (Task 7), cron wiring (Tasks 8–9), page with table + severity trend + filters/pagination (Tasks 10–11), nav (Task 12), dashboard tile (Task 13). Read-only (no ack/clear back to APIC), no per-fault drawer, no pruning — all consistent with the spec's YAGNI list.
- **Type consistency:** `ApicFaultRow`, `FaultCounts`, `ResyncFaultsResult`, `FaultRowProps`, `FaultTileHost` are each defined once and reused; `selectClearedDns`/`tallyFaultCounts`/`parseFaultRows` names match across tasks; unique key `apicHostId_dn` matches the `@@unique([apicHostId, dn])` in Task 1.
- **Severity warning note:** `FaultCountSample.warning` and the page trend track `warning`; the dashboard tile headline intentionally shows only critical/major/minor (per spec).
