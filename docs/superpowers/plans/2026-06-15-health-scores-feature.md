# Health Scores Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect Cisco ACI health scores (0–100) from APIC on the existing manual + scheduled resync flows, store them with history, and report a headline overall fabric score + over-time trend + worst-first node/tenant breakdown on a new `/health-scores` page, plus a dashboard tile.

**Architecture:** Mirror the existing Faults collector exactly — a `resyncHealthScores` lib (APIC login → three GET class queries → chunked upsert of a `HealthScoreSnapshot` model + one `HealthScoreSample` per resync for the overall trend), an authed `POST /api/health-scores/resync` route, cron wiring, and a server-component page. Three APIC sources feed it: `fabricHealthTotal` (fabric + pod), `topSystem` with health (per node), `fvTenant` with health (per tenant). Read-only.

**Tech Stack:** Next.js (App Router, server components), Prisma + SQLite, better-auth, recharts + shadcn chart primitives, bun test.

**Reference template (read these — the new code mirrors them):**
- `src/lib/apic/faults.ts`, `src/app/api/faults/resync/route.ts`
- `src/app/(app)/faults/page.tsx`, `src/app/(app)/faults/FaultsClient.tsx`, `src/app/(app)/faults/sort.ts`
- `src/actions/faults.ts`, `src/app/(app)/dashboard/FaultsTile.tsx`
- `src/lib/apic/cron-resync.ts`, `src/app/api/cron/resync/route.ts`

---

## File Structure

**Create:**
- `src/lib/apic/health-scores.ts` — types, three parse helpers, `parseHealthRows`, `healthBand`, `summarizeHealth`, `fetchHealthScoresFromApic`, `resyncHealthScores`
- `src/lib/apic/health-scores.test.ts` — parse / band / summarize unit tests
- `src/app/api/health-scores/resync/route.ts` — manual resync endpoint
- `src/app/(app)/health-scores/page.tsx` — server component
- `src/app/(app)/health-scores/HealthScoresClient.tsx` — headline + trend + breakdown table
- `src/app/(app)/health-scores/sort.ts` — worst-first sort helper
- `src/app/(app)/health-scores/sort.test.ts` — sort tests
- `src/actions/health-scores.ts` — `getHealthSummary` server action for the dashboard tile
- `src/app/(app)/dashboard/HealthTile.tsx` — dashboard summary tile

**Modify:**
- `prisma/schema.prisma` — add `HealthScoreSnapshot`, `HealthScoreSample`, `ApicHost.lastHealthSyncAt` + relations
- `src/lib/audit.ts` — add `'resync.health'` action
- `src/app/(app)/history/HistoryClient.tsx` — add `'resync.health'` to `ACTION_LABELS`
- `src/lib/apic/cron-resync.ts` — add `healthScores` to `HostResult` + `summarizeResults`
- `src/lib/apic/cron-resync.test.ts` — cover the health dataset
- `src/app/api/cron/resync/route.ts` — add the Health dataset block
- `src/components/AppSidebar.tsx` — add the Health Scores nav entry
- `src/app/(app)/dashboard/page.tsx` — render `HealthTile`

---

## Task 1: Prisma schema — health-score models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `lastHealthSyncAt` and relations to `ApicHost`**

In the `ApicHost` model, add the field next to `lastFaultSyncAt` and two back-relations next to `faults` / `faultCounts`:

```prisma
  lastFaultSyncAt     DateTime?
  lastHealthSyncAt    DateTime?
  endpoints           Endpoint[]
  interfaces          InterfaceSnapshot[]
  faults              FaultSnapshot[]
  faultCounts         FaultCountSample[]
  healthScores        HealthScoreSnapshot[]
  healthSamples       HealthScoreSample[]
```

(Preserve the other existing fields; only add the new field + two relations. Match the column alignment style already in the file.)

- [ ] **Step 2: Append the two models** after `FaultCountSample`:

```prisma
model HealthScoreSnapshot {
  id          String   @id @default(cuid())
  apicHostId  String
  apicHost    ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn          String
  scope       String
  name        String   @default("")
  node        String?
  score       Int
  twScore     Int?
  prevScore   Int?
  maxSeverity String?
  present     Boolean  @default(true)
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  @@unique([apicHostId, dn])
  @@index([apicHostId])
  @@index([apicHostId, scope])
  @@map("health_score_snapshot")
}

model HealthScoreSample {
  id            String   @id @default(cuid())
  apicHostId    String
  apicHost      ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  sampledAt     DateTime @default(now())
  overall       Int
  worstScore    Int
  degradedCount Int

  @@index([apicHostId, sampledAt])
  @@map("health_score_sample")
}
```

- [ ] **Step 3: Create the migration and regenerate the client**

Run: `bunx prisma migrate dev --name add_health_scores`
Expected: a new folder `prisma/migrations/*_add_health_scores`, and "Generated Prisma Client" output.

- [ ] **Step 4: Verify the client compiles with the new types**

Run: `bunx tsc --noEmit 2>&1 | grep -i "healthscore" || echo "no healthscore type errors"`
Expected: `no healthscore type errors` (the repo has ~26 pre-existing unrelated tsc errors — ignore those).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add HealthScoreSnapshot and HealthScoreSample models"
```

---

## Task 2: Health-score parsing — three parse helpers

**Files:**
- Create: `src/lib/apic/health-scores.ts`
- Test: `src/lib/apic/health-scores.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/apic/health-scores.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import {
  parseFabricHealthRows,
  parseNodeHealthRows,
  parseTenantHealthRows,
  parseHealthRows,
  type FabricHealthNode,
  type TopSystemHealthNode,
  type TenantHealthNode,
} from './health-scores'

describe('parseFabricHealthRows', () => {
  it('maps the fabric total to a fabric-scope row with /health stripped', () => {
    const imdata: FabricHealthNode[] = [
      { fabricHealthTotal: { attributes: { dn: 'topology/health', cur: '96', twScore: '95' } } },
    ]
    const [row] = parseFabricHealthRows(imdata)
    expect(row.dn).toBe('topology')
    expect(row.scope).toBe('fabric')
    expect(row.name).toBe('Fabric')
    expect(row.score).toBe(96)
    expect(row.twScore).toBe(95)
    expect(row.node).toBeNull()
  })

  it('maps a pod total to a pod-scope row named "Pod N"', () => {
    const imdata: FabricHealthNode[] = [
      { fabricHealthTotal: { attributes: { dn: 'topology/pod-1/health', cur: '88' } } },
    ]
    const [row] = parseFabricHealthRows(imdata)
    expect(row.dn).toBe('topology/pod-1')
    expect(row.scope).toBe('pod')
    expect(row.name).toBe('Pod 1')
    expect(row.score).toBe(88)
  })
})

describe('parseNodeHealthRows', () => {
  it('maps a topSystem + healthInst child to a node-scope row', () => {
    const imdata: TopSystemHealthNode[] = [
      {
        topSystem: {
          attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', name: 'leaf-101' },
          children: [{ healthInst: { attributes: { cur: '92', maxSev: 'minor' } } }],
        },
      },
    ]
    const [row] = parseNodeHealthRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101/sys')
    expect(row.scope).toBe('node')
    expect(row.name).toBe('leaf-101')
    expect(row.node).toBe('101')
    expect(row.score).toBe(92)
    expect(row.maxSeverity).toBe('minor')
  })

  it('falls back to "Node <id>" when name is empty and skips rows without a health child', () => {
    const named: TopSystemHealthNode[] = [
      {
        topSystem: {
          attributes: { dn: 'topology/pod-1/node-102/sys', id: '102', name: '' },
          children: [{ healthInst: { attributes: { cur: '100' } } }],
        },
      },
    ]
    expect(parseNodeHealthRows(named)[0].name).toBe('Node 102')

    const noHealth: TopSystemHealthNode[] = [
      { topSystem: { attributes: { dn: 'x', id: '1', name: 'n' }, children: [] } },
    ]
    expect(parseNodeHealthRows(noHealth)).toEqual([])
  })
})

describe('parseTenantHealthRows', () => {
  it('maps an fvTenant + healthInst child to a tenant-scope row', () => {
    const imdata: TenantHealthNode[] = [
      {
        fvTenant: {
          attributes: { dn: 'uni/tn-TenantA', name: 'TenantA' },
          children: [{ healthInst: { attributes: { cur: '74' } } }],
        },
      },
    ]
    const [row] = parseTenantHealthRows(imdata)
    expect(row.dn).toBe('uni/tn-TenantA')
    expect(row.scope).toBe('tenant')
    expect(row.name).toBe('TenantA')
    expect(row.node).toBeNull()
    expect(row.score).toBe(74)
  })
})

describe('parseHealthRows', () => {
  it('concatenates fabric, node, and tenant rows', () => {
    const rows = parseHealthRows({
      fabric: [{ fabricHealthTotal: { attributes: { dn: 'topology/health', cur: '96' } } }],
      node: [
        {
          topSystem: {
            attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', name: 'leaf-101' },
            children: [{ healthInst: { attributes: { cur: '92' } } }],
          },
        },
      ],
      tenant: [
        {
          fvTenant: {
            attributes: { dn: 'uni/tn-A', name: 'A' },
            children: [{ healthInst: { attributes: { cur: '74' } } }],
          },
        },
      ],
    })
    expect(rows.map(r => r.scope)).toEqual(['fabric', 'node', 'tenant'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/health-scores.test.ts`
Expected: FAIL — cannot find module `./health-scores`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/apic/health-scores.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { apicFetch, apicLogin } from './client'

export type HealthScope = 'fabric' | 'pod' | 'node' | 'tenant'

export interface ParsedHealthRow {
  dn: string
  scope: HealthScope
  name: string
  node: string | null
  score: number
  twScore: number | null
  prevScore: number | null
  maxSeverity: string | null
}

interface HealthInstAttrs {
  cur?: string
  twScore?: string
  prev?: string
  maxSev?: string
}

interface MoWithHealth {
  attributes: Record<string, string>
  children?: Array<{ healthInst?: { attributes: HealthInstAttrs } }>
}

export interface FabricHealthNode {
  fabricHealthTotal?: { attributes: { dn: string; cur?: string; twScore?: string } }
}
export interface TopSystemHealthNode {
  topSystem?: MoWithHealth
}
export interface TenantHealthNode {
  fvTenant?: MoWithHealth
}

function toInt(value: string | undefined): number {
  if (value === undefined) return 0
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? 0 : n
}

function toIntOrNull(value: string | undefined): number | null {
  if (value === undefined) return null
  const n = parseInt(value, 10)
  return Number.isNaN(n) ? null : n
}

function findHealthInst(mo: MoWithHealth): HealthInstAttrs | null {
  const child = mo.children?.find(c => c.healthInst)?.healthInst
  return child?.attributes ?? null
}

const POD_RE = /topology\/pod-(\d+)\b/

export function parseFabricHealthRows(imdata: FabricHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.fabricHealthTotal
    if (!mo) continue
    const a = mo.attributes
    const dn = a.dn.replace(/\/health$/, '')
    const podMatch = POD_RE.exec(dn)
    const scope: HealthScope = podMatch ? 'pod' : 'fabric'
    rows.push({
      dn,
      scope,
      name: scope === 'pod' ? `Pod ${podMatch![1]}` : 'Fabric',
      node: null,
      score: toInt(a.cur),
      twScore: toIntOrNull(a.twScore),
      prevScore: null,
      maxSeverity: null,
    })
  }
  return rows
}

export function parseNodeHealthRows(imdata: TopSystemHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.topSystem
    if (!mo) continue
    const health = findHealthInst(mo)
    if (!health) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      scope: 'node',
      name: a.name && a.name.length > 0 ? a.name : `Node ${a.id}`,
      node: a.id ?? null,
      score: toInt(health.cur),
      twScore: toIntOrNull(health.twScore),
      prevScore: toIntOrNull(health.prev),
      maxSeverity: health.maxSev ?? null,
    })
  }
  return rows
}

export function parseTenantHealthRows(imdata: TenantHealthNode[]): ParsedHealthRow[] {
  const rows: ParsedHealthRow[] = []
  for (const item of imdata) {
    const mo = item.fvTenant
    if (!mo) continue
    const health = findHealthInst(mo)
    if (!health) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      scope: 'tenant',
      name: a.name ?? '',
      node: null,
      score: toInt(health.cur),
      twScore: toIntOrNull(health.twScore),
      prevScore: toIntOrNull(health.prev),
      maxSeverity: health.maxSev ?? null,
    })
  }
  return rows
}

export function parseHealthRows(sources: {
  fabric: FabricHealthNode[]
  node: TopSystemHealthNode[]
  tenant: TenantHealthNode[]
}): ParsedHealthRow[] {
  return [
    ...parseFabricHealthRows(sources.fabric),
    ...parseNodeHealthRows(sources.node),
    ...parseTenantHealthRows(sources.tenant),
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/health-scores.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/health-scores.ts src/lib/apic/health-scores.test.ts
git commit -m "feat: add health-score parse helpers"
```

---

## Task 3: `healthBand` + `summarizeHealth` helpers

**Files:**
- Modify: `src/lib/apic/health-scores.ts`
- Test: `src/lib/apic/health-scores.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/apic/health-scores.test.ts`:

```typescript
import { healthBand, summarizeHealth, type ParsedHealthRow } from './health-scores'

describe('healthBand', () => {
  it('classifies scores into good/fair/poor by threshold', () => {
    expect(healthBand(95)).toBe('good')
    expect(healthBand(100)).toBe('good')
    expect(healthBand(94)).toBe('fair')
    expect(healthBand(80)).toBe('fair')
    expect(healthBand(79)).toBe('poor')
    expect(healthBand(0)).toBe('poor')
  })
})

describe('summarizeHealth', () => {
  const mk = (scope: ParsedHealthRow['scope'], score: number): ParsedHealthRow => ({
    dn: `${scope}-${score}`, scope, name: scope, node: null,
    score, twScore: null, prevScore: null, maxSeverity: null,
  })

  it('takes overall from the fabric row, worst+degraded from node/tenant rows', () => {
    const rows = [
      mk('fabric', 96), mk('pod', 90),
      mk('node', 99), mk('node', 70),
      mk('tenant', 85),
    ]
    expect(summarizeHealth(rows)).toEqual({ overall: 96, worstScore: 70, degradedCount: 2 })
    // degraded (<90): node 70 and tenant 85 => 2; pod/fabric excluded
  })

  it('defaults worstScore to overall when there are no node/tenant rows', () => {
    expect(summarizeHealth([mk('fabric', 88)])).toEqual({
      overall: 88, worstScore: 88, degradedCount: 0,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/health-scores.test.ts`
Expected: FAIL — `healthBand` / `summarizeHealth` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/apic/health-scores.ts`:

```typescript
export const GOOD_MIN = 95
export const FAIR_MIN = 80
export const DEGRADED_THRESHOLD = 90

export type HealthBand = 'good' | 'fair' | 'poor'

export function healthBand(score: number): HealthBand {
  if (score >= GOOD_MIN) return 'good'
  if (score >= FAIR_MIN) return 'fair'
  return 'poor'
}

export interface HealthSummary {
  overall: number
  worstScore: number
  degradedCount: number
}

export function summarizeHealth(rows: ParsedHealthRow[]): HealthSummary {
  const overall = rows.find(r => r.scope === 'fabric')?.score ?? 0
  const breakdown = rows.filter(r => r.scope === 'node' || r.scope === 'tenant')
  const worstScore = breakdown.length > 0
    ? Math.min(...breakdown.map(r => r.score))
    : overall
  const degradedCount = breakdown.filter(r => r.score < DEGRADED_THRESHOLD).length
  return { overall, worstScore, degradedCount }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/health-scores.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/health-scores.ts src/lib/apic/health-scores.test.ts
git commit -m "feat: add healthBand and summarizeHealth helpers"
```

---

## Task 4: `fetchHealthScoresFromApic` + `resyncHealthScores`

Integration layer — no new unit test (matches `faults.ts` / `interfaces.ts`).

**Files:**
- Modify: `src/lib/apic/health-scores.ts`

- [ ] **Step 1: Add the fetch function**

Append to `src/lib/apic/health-scores.ts`:

```typescript
async function getJson<T>(host: string, token: string, path: string): Promise<T[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: T[] }
  return data.imdata ?? []
}

export async function fetchHealthScoresFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<ParsedHealthRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const [fabric, node, tenant] = await Promise.all([
    getJson<FabricHealthNode>(host, token, '/api/node/class/fabricHealthTotal.json'),
    getJson<TopSystemHealthNode>(host, token, '/api/node/class/topSystem.json?rsp-subtree-include=health'),
    getJson<TenantHealthNode>(host, token, '/api/node/class/fvTenant.json?rsp-subtree-include=health'),
  ])
  return parseHealthRows({ fabric, node, tenant })
}
```

- [ ] **Step 2: Add the resync function**

Append to `src/lib/apic/health-scores.ts`:

```typescript
const HEALTH_CHUNK_SIZE = 100

export interface ResyncHealthArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncHealthResult {
  synced: number
  total: number
  overall: number
}

/**
 * Fetch health scores from APIC and persist them for one host.
 * Phase 1 upserts HealthScoreSnapshot rows; phase 2 marks vanished objects
 * `present=false`; phase 3 records one HealthScoreSample for the overall trend.
 */
export async function resyncHealthScores(args: ResyncHealthArgs): Promise<ResyncHealthResult> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchHealthScoresFromApic(host, username, password)

  const deduped = new Map<string, ParsedHealthRow>()
  for (const row of rows) if (row.dn) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values())
  const now = new Date()

  // Phase 1: upsert snapshots (chunked).
  for (let i = 0; i < uniqueRows.length; i += HEALTH_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + HEALTH_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.healthScoreSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            scope: row.scope,
            name: row.name,
            node: row.node,
            score: row.score,
            twScore: row.twScore,
            prevScore: row.prevScore,
            maxSeverity: row.maxSeverity,
            present: true,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            scope: row.scope,
            name: row.name,
            node: row.node,
            score: row.score,
            twScore: row.twScore,
            prevScore: row.prevScore,
            maxSeverity: row.maxSeverity,
            present: true,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  // Phase 2: mark previously-present objects that disappeared as absent.
  const currentDns = uniqueRows.map(r => r.dn)
  await prisma.healthScoreSnapshot.updateMany({
    where: { apicHostId, present: true, dn: { notIn: currentDns } },
    data: { present: false },
  })

  // Phase 3: record an overall-trend sample.
  const summary = summarizeHealth(uniqueRows)
  await prisma.healthScoreSample.create({
    data: {
      apicHostId,
      sampledAt: now,
      overall: summary.overall,
      worstScore: summary.worstScore,
      degradedCount: summary.degradedCount,
    },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastHealthSyncAt: now },
  })

  const total = await prisma.healthScoreSnapshot.count({ where: { apicHostId, present: true } })
  return { synced: uniqueRows.length, total, overall: summary.overall }
}
```

Note: if `currentDns` is empty, Prisma's `notIn: []` matches all rows — but phase 1 upserted nothing in that case, so marking all `present=false` is correct (APIC returned no health objects). No special-casing needed.

- [ ] **Step 3: Verify**

Run: `bun test src/lib/apic/health-scores.test.ts`
Expected: existing tests still PASS. Confirm Prisma model references (`prisma.healthScoreSnapshot`, `prisma.healthScoreSample`, compound key `apicHostId_dn`) resolve — if not, run `bunx prisma generate` and retry.

- [ ] **Step 4: Commit**

```bash
git add src/lib/apic/health-scores.ts
git commit -m "feat: add fetchHealthScoresFromApic and resyncHealthScores"
```

---

## Task 5: Audit action (union + history label)

**Files:**
- Modify: `src/lib/audit.ts`
- Modify: `src/app/(app)/history/HistoryClient.tsx`

- [ ] **Step 1: Add the action to the union**

In `src/lib/audit.ts`, in the `AuditAction` union, add after `'resync.faults'`:

```typescript
  | 'resync.health'
```

- [ ] **Step 2: Add the label to the exhaustive map**

In `src/app/(app)/history/HistoryClient.tsx`, the `ACTION_LABELS: Record<AuditAction, string>` map must stay exhaustive. Add after the `'resync.faults'` line:

```typescript
  'resync.health': 'Resync health',
```

- [ ] **Step 3: Verify no missing-key type error**

Run: `bunx tsc --noEmit 2>&1 | grep -i "ACTION_LABELS\|resync.health" || echo "no health audit type errors"`
Expected: `no health audit type errors`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit.ts "src/app/(app)/history/HistoryClient.tsx"
git commit -m "feat: add resync.health audit action and history label"
```

---

## Task 6: `POST /api/health-scores/resync` route

**Files:**
- Create: `src/app/api/health-scores/resync/route.ts`

- [ ] **Step 1: Write the route** (mirrors `src/app/api/faults/resync/route.ts`):

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncHealthScores } from '@/lib/apic/health-scores'

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
    result = await resyncHealthScores({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch health scores from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.health',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.synced} (total ${result.total})`,
  })

  return Response.json(result)
}
```

- [ ] **Step 2: Verify** — Run: `bun test src/lib/apic` (confirms imports resolve). Confirm no new tsc error in the route file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health-scores/resync/route.ts
git commit -m "feat: add POST /api/health-scores/resync route"
```

---

## Task 7: Cron-resync summary support

**Files:**
- Modify: `src/lib/apic/cron-resync.ts`
- Test: `src/lib/apic/cron-resync.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/lib/apic/cron-resync.test.ts` (reuse the existing `summarizeResults` / `HostResult` imports — do not duplicate):

```typescript
describe('summarizeResults with health dataset', () => {
  it('counts the health dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        faults: { synced: 3, total: 3 },
        healthScores: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: FAIL (assertion returns 'success' because `healthScores` isn't counted, or a type error on the unknown property).

- [ ] **Step 3: Add `healthScores` to `HostResult` and the summary loop**

In `src/lib/apic/cron-resync.ts`, add to `HostResult` (next to `faults?`):

```typescript
  healthScores?: DatasetResult
```

And in `summarizeResults`, extend the dataset loop:

```typescript
    for (const d of [r.endpoints, r.interfaces, r.faults, r.healthScores]) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/cron-resync.ts src/lib/apic/cron-resync.test.ts
git commit -m "feat: track health dataset in cron resync summary"
```

---

## Task 8: Cron route wiring

**Files:**
- Modify: `src/app/api/cron/resync/route.ts`

- [ ] **Step 1: Import `resyncHealthScores`**

Add alongside the other resync imports:

```typescript
import { resyncHealthScores } from '@/lib/apic/health-scores'
```

- [ ] **Step 2: Add the Health dataset block** after the Faults block and before `results.push(result)`:

```typescript
    // Health scores
    let healthScores: DatasetResult
    try {
      healthScores = await resyncHealthScores({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      healthScores = { error: errorMessage(err, 'Failed to resync health scores') }
    }
    result.healthScores = healthScores
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.health',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in healthScores ? 'failure' : 'success',
      detail: 'error' in healthScores
        ? healthScores.error
        : `synced ${healthScores.synced} (total ${healthScores.total})`,
    })
```

Match exact indentation and the in-scope variable names (`apicHostId`, `apicHost`, `trimmedUser`, `password`). `resyncHealthScores` returns `{ synced, total, overall }`; assigning to `DatasetResult` is valid since `result.healthScores` only needs `synced`/`total`/`error`.

- [ ] **Step 3: Verify** — Run: `bun test src/lib/apic/cron-resync.test.ts`. Confirm no new tsc error in the cron route file.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/resync/route.ts
git commit -m "feat: resync health scores in scheduled cron job"
```

---

## Task 9: Worst-first sort helper

**Files:**
- Create: `src/app/(app)/health-scores/sort.ts`
- Test: `src/app/(app)/health-scores/sort.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/health-scores/sort.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { sortHealthRows } from './sort'

describe('sortHealthRows', () => {
  it('orders worst (lowest) score first', () => {
    const rows = [
      { score: 99, name: 'a' },
      { score: 70, name: 'b' },
      { score: 88, name: 'c' },
    ]
    expect(sortHealthRows(rows).map(r => r.score)).toEqual([70, 88, 99])
  })

  it('breaks ties by name using natural order', () => {
    const rows = [
      { score: 90, name: 'node-10' },
      { score: 90, name: 'node-2' },
    ]
    expect(sortHealthRows(rows).map(r => r.name)).toEqual(['node-2', 'node-10'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "src/app/(app)/health-scores/sort.test.ts"`
Expected: FAIL — cannot find module `./sort`.

- [ ] **Step 3: Implement the sort helper**

Create `src/app/(app)/health-scores/sort.ts`:

```typescript
interface SortableHealthRow {
  score: number
  name: string
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

export function sortHealthRows<T extends SortableHealthRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return NATURAL_COLLATOR.compare(a.name, b.name)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "src/app/(app)/health-scores/sort.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/health-scores/sort.ts" "src/app/(app)/health-scores/sort.test.ts"
git commit -m "feat: add worst-first health sort helper"
```

---

## Task 10: Health Scores page (server) + client

Mirrors the Faults page. **Read `src/app/(app)/faults/page.tsx` and `FaultsClient.tsx` as the template** — copy the host-selector, page-size parsing, search/pagination, resync-credential-dialog, and trend-chart scaffolding, then adapt for health scores. Reproducing the full client here would be noise; the health-specific pieces are below.

**Files:**
- Create: `src/app/(app)/health-scores/page.tsx`
- Create: `src/app/(app)/health-scores/HealthScoresClient.tsx`

- [ ] **Step 1: Write the server component**

Create `src/app/(app)/health-scores/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { HealthScoresClient, type HealthRowProps } from './HealthScoresClient'
import { sortHealthRows } from './sort'

export const metadata: Metadata = {
  title: 'Health Scores',
  description: 'Cisco ACI fabric, node, and tenant health scores resynced from APIC, with overall trend.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_SCOPES = ['node', 'tenant'] as const

export default async function HealthScoresPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    scope?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, scope, page: pageParam, pageSize: pageSizeParam } = await searchParams
  const apicHosts = await getApicHosts()

  const scopeFilter = (VALID_SCOPES as readonly string[]).includes(scope ?? '')
    ? (scope as string)
    : undefined
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let rows: HealthRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let fabricScore: number | null = null
  let pods: { name: string; score: number }[] = []
  let trend: { sampledAt: string; overall: number; worstScore: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastHealthSyncAt: true },
    })
    lastSyncedAt = host?.lastHealthSyncAt ?? null

    // Breakdown table: node/tenant scopes only.
    const where = {
      apicHostId: apic,
      present: true,
      scope: scopeFilter ? scopeFilter : { in: ['node', 'tenant'] },
      ...(query?.trim()
        ? {
            OR: [
              { name: { contains: query.trim() } },
              { node: { contains: query.trim() } },
              { dn: { contains: query.trim() } },
            ],
          }
        : {}),
    }

    total = await prisma.healthScoreSnapshot.count({ where })

    const records = await prisma.healthScoreSnapshot.findMany({
      where,
      ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    })
    rows = sortHealthRows(
      records.map(r => ({
        id: r.id,
        scope: r.scope,
        name: r.name,
        node: r.node,
        score: r.score,
        maxSeverity: r.maxSeverity,
        lastSeenAt: r.lastSeenAt.toISOString(),
      })),
    )

    // Headline: fabric + pod scopes.
    const headline = await prisma.healthScoreSnapshot.findMany({
      where: { apicHostId: apic, present: true, scope: { in: ['fabric', 'pod'] } },
      select: { scope: true, name: true, score: true },
    })
    fabricScore = headline.find(h => h.scope === 'fabric')?.score ?? null
    pods = headline
      .filter(h => h.scope === 'pod')
      .map(h => ({ name: h.name, score: h.score }))

    const samples = await prisma.healthScoreSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, overall: true, worstScore: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        overall: s.overall,
        worstScore: s.worstScore,
      }))
  }

  return (
    <HealthScoresClient
      apicHosts={apicHosts}
      selectedApic={apic ?? null}
      query={query ?? ''}
      scope={scopeFilter ?? null}
      rows={rows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      fabricScore={fabricScore}
      pods={pods}
      trend={trend}
    />
  )
}
```

After writing, VERIFY the props passed to `<HealthScoresClient>` exactly match its props interface (Step 2), and that `getApicHosts` import + host shape match the faults page.

- [ ] **Step 2: Write the client component**

Create `src/app/(app)/health-scores/HealthScoresClient.tsx` by mirroring `FaultsClient.tsx`'s scaffolding. It MUST:

1. Be `'use client'`, export named `HealthScoresClient` and `HealthRowProps`:

```tsx
export interface HealthRowProps {
  id: string
  scope: string
  name: string
  node: string | null
  score: number
  maxSeverity: string | null
  lastSeenAt: string
}
```

2. Accept props matching exactly what `page.tsx` passes: `apicHosts` (same `SafeApicHost[]` type the faults client imports from `@/actions/apic-hosts`), `selectedApic: string | null`, `query: string`, `scope: string | null`, `rows: HealthRowProps[]`, `total: number`, `page: number`, `pageSize: number | 'all'`, `lastSyncedAt: string | null`, `fabricScore: number | null`, `pods: { name: string; score: number }[]`, `trend: { sampledAt: string; overall: number; worstScore: number }[]`.

3. Reuse from `FaultsClient.tsx` (copy + adapt, same UX/visual conventions): page header, host selector (sets `apic` URL param), search input with the debounced URL-echo handling, page-size selector, pagination, last-synced display, and the resync credential dialog — except it POSTs to `/api/health-scores/resync` (body `{ apicHostId, username, password }`) then `router.refresh()`. Surface errors inline.

4. **Headline block** (above the table): the `fabricScore` as a large number colored by a local `healthBand` helper (duplicate the thresholds locally — ≥95 good=green, ≥80 fair=amber, <80 poor=red — using the project's color/`cn` conventions; do NOT import from the server-only `@/lib/apic/health-scores` since that module imports `prisma`). Show "—" when `fabricScore` is null. Beneath it, render small per-pod cards from `pods` (name + band-colored score) when `pods.length > 0`.

5. **Scope filter** control (node / tenant / all) that sets the `scope` URL param, using the same `router.push` pattern as the faults severity filter.

6. **Breakdown table** columns: Scope, Name, Node (show `node` else "—"), Score (band-colored badge), Max severity (show `maxSeverity` else "—"), Last seen (same friendly date format as the faults table). Rows arrive already worst-first from the server. Use the same `@/components/ui` table primitives as `FaultsClient`.

7. **Overall trend chart** above the table using the same recharts + shadcn approach as `FaultsClient` (`ChartContainer`, `ChartConfig`, `LineChart`, `Line`, `ChartTooltip`, `ChartTooltipContent` from `@/components/ui/chart`). Two lines: `overall` and `worstScore` over `trend` (x = `sampledAt` friendly date). Hide the chart when `trend.length === 0`:

```tsx
const trendConfig: ChartConfig = {
  overall: { label: 'Overall', color: 'var(--chart-1)' },
  worstScore: { label: 'Worst', color: 'var(--chart-2)' },
}
```

8. Empty states for no host selected / no rows, mirroring `FaultsClient`.

- [ ] **Step 3: Verify**
- Run `bun test` — all tests still pass (report counts).
- Run `bun run lint` — your two new files must add no NEW lint errors beyond the known inherited `react-hooks` URL-echo pattern that also exists in `FaultsClient.tsx`/`InterfaceHealthClient.tsx`. Ignore unrelated pre-existing issues.
- If a type/lint issue in your files can't be resolved after reasonable effort, report DONE_WITH_CONCERNS with specifics.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/health-scores/page.tsx" "src/app/(app)/health-scores/HealthScoresClient.tsx"
git commit -m "feat: add health scores page with headline, trend, and breakdown"
```

---

## Task 11: Sidebar navigation entry

**Files:**
- Modify: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Import the icon**

Add `IconHeartRateMonitor` to the `@tabler/icons-react` import block (next to `IconAlertTriangle`).

- [ ] **Step 2: Add the nav entry** immediately after the Faults entry (`href: "/faults"`):

```tsx
      {
        href: "/health-scores",
        label: "Health Scores",
        icon: <IconHeartRateMonitor size={15} stroke={1.75} />,
      },
```

- [ ] **Step 3: Verify** — Run: `bunx tsc --noEmit 2>&1 | grep -i "AppSidebar" || echo "no sidebar type errors"`. Expected: `no sidebar type errors`.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: add Health Scores sidebar navigation entry"
```

---

## Task 12: Dashboard health tile

**Files:**
- Create: `src/actions/health-scores.ts`
- Create: `src/app/(app)/dashboard/HealthTile.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Write the server action**

Create `src/actions/health-scores.ts` (mirrors `src/actions/faults.ts` — match its exact auth/session convention):

```typescript
'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface HealthTileHost {
  apicHostId: string
  name: string
  overall: number | null
  worstScore: number | null
  lastSyncedAt: string | null
}

/** Latest overall fabric score + worst node/tenant score per host. */
export async function getHealthSummary(): Promise<HealthTileHost[]> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return []

  const hosts = await prisma.apicHost.findMany({
    select: { id: true, name: true, lastHealthSyncAt: true },
  })

  const summary: HealthTileHost[] = []
  for (const host of hosts) {
    const fabric = await prisma.healthScoreSnapshot.findFirst({
      where: { apicHostId: host.id, present: true, scope: 'fabric' },
      select: { score: true },
    })
    const worst = await prisma.healthScoreSnapshot.findFirst({
      where: { apicHostId: host.id, present: true, scope: { in: ['node', 'tenant'] } },
      orderBy: { score: 'asc' },
      select: { score: true },
    })
    summary.push({
      apicHostId: host.id,
      name: host.name,
      overall: fabric?.score ?? null,
      worstScore: worst?.score ?? null,
      lastSyncedAt: host.lastHealthSyncAt ? host.lastHealthSyncAt.toISOString() : null,
    })
  }
  return summary
}
```

- [ ] **Step 2: Write the tile component**

Create `src/app/(app)/dashboard/HealthTile.tsx`:

```tsx
import Link from 'next/link'
import { IconHeartRateMonitor } from '@tabler/icons-react'
import { getHealthSummary } from '@/actions/health-scores'

function band(score: number | null): string {
  if (score === null) return 'text-muted-foreground'
  if (score >= 95) return 'text-green-600'
  if (score >= 80) return 'text-amber-500'
  return 'text-red-600'
}

export async function HealthTile() {
  const summary = await getHealthSummary()
  // Fabric-wide headline: lowest overall across hosts (worst fabric wins attention).
  const overalls = summary.map(h => h.overall).filter((s): s is number => s !== null)
  const overall = overalls.length > 0 ? Math.min(...overalls) : null
  const worsts = summary.map(h => h.worstScore).filter((s): s is number => s !== null)
  const worst = worsts.length > 0 ? Math.min(...worsts) : null

  return (
    <Link
      href="/health-scores"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Health Scores</h3>
        <IconHeartRateMonitor size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className={`text-2xl font-semibold ${band(overall)}`}>{overall ?? '—'}</span>
        <span className="text-sm text-subtle">
          worst <span className={band(worst)}>{worst ?? '—'}</span>
        </span>
      </div>
      <p className="text-xs text-subtle mt-1">overall fabric / worst node or tenant</p>
    </Link>
  )
}
```

- [ ] **Step 3: Add the tile to the dashboard grid**

In `src/app/(app)/dashboard/page.tsx`, add the import and place `<HealthTile />` in the existing tile grid next to `<FaultsTile />`:

```tsx
import { HealthTile } from './HealthTile'
```

The grid `<div>` already contains `<FaultsTile />`; add `<HealthTile />` immediately after it inside the same grid.

- [ ] **Step 4: Verify**
- Run `bun test` — all pass (report counts).
- Run `bun run lint` — the three touched files must add no NEW lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/health-scores.ts "src/app/(app)/dashboard/HealthTile.tsx" "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: add health scores summary tile to dashboard"
```

---

## Final verification

- [ ] **Run the full test suite** — Run: `bun test`. Expected: all pass, including new `health-scores.test.ts` and `sort.test.ts` and the updated `cron-resync.test.ts`.
- [ ] **Lint** — Run: `bun run lint`. Expected: no new errors beyond the known inherited `react-hooks` URL-echo pattern in the client components.
- [ ] **End-to-end smoke test** — With a reachable APIC: trigger a manual resync from `/health-scores`, confirm the headline score, trend, and breakdown table populate; confirm `/dashboard` shows the Health tile; confirm `/api/cron/resync` includes a `healthScores` block in its response.

---

## Self-Review notes (addressed)

- **Spec coverage:** data model (Task 1), three parse helpers + `parseHealthRows` (Task 2), `healthBand`/`summarizeHealth` (Task 3), `fetchHealthScoresFromApic`/`resyncHealthScores` with present-detection + sample (Task 4), audit union **and** history label (Task 5), manual route (Task 6), cron summary + wiring (Tasks 7–8), worst-first sort (Task 9), page with headline + trend + worst-first breakdown + scope filter (Task 10), sidebar (Task 11), dashboard tile (Task 12). Read-only, no per-object drilldown, constant thresholds — consistent with the spec's YAGNI list.
- **Type consistency:** `ParsedHealthRow`, `HealthScope`, `HealthBand`, `HealthSummary`, `ResyncHealthResult`, `HealthRowProps`, `HealthTileHost` each defined once and reused; parse-helper names (`parseFabricHealthRows`/`parseNodeHealthRows`/`parseTenantHealthRows`/`parseHealthRows`) consistent across Tasks 2/4/10; compound key `apicHostId_dn` matches the `@@unique([apicHostId, dn])` in Task 1; `summarizeHealth` fields (`overall`/`worstScore`/`degradedCount`) match the `HealthScoreSample` columns.
- **Server/client boundary:** the client (Task 10) duplicates the band thresholds locally instead of importing `@/lib/apic/health-scores` (which imports `prisma`), avoiding a server-only module in a client component. The dashboard tile (Task 12) likewise inlines `band()`.
- **Threshold note:** `DEGRADED_THRESHOLD = 90` (trend `degradedCount`) is intentionally distinct from the display band thresholds (95/80), per the spec.
