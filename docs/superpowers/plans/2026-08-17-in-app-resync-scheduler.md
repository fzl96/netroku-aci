# In-App Resync Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move APIC resync scheduling from a host systemd timer into the app, so an admin defines which devices sync and how often from a UI page.

**Architecture:** A `ResyncSchedule` row per APIC host holds `enabled`, `intervalMinutes`, and AES-256-GCM-encrypted credentials. A stateless ticker POSTs `/api/cron/tick` roughly every 60s; the handler claims **one** due schedule at a time with a single atomic SQL statement, runs it via an extracted `resyncHost()`, then finalizes `nextRunAt`/`lastStatus` in a `finally` block. All scheduling policy lives in Postgres; the ticker carries no configuration.

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma 6 + Postgres 17, better-auth (admin/member roles), zod, bun test, Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-17-in-app-resync-scheduler-design.md`

## Global Constraints

- **Interval floor: 15 minutes. Ceiling: 10080 minutes (1 week).** Enforced in the zod schema, not just the UI.
- **Stale-claim window: 120 minutes** (`STALE_CLAIM_MINUTES`). Must exceed the longest plausible single-host resync.
- **Default interval: 480 minutes (8h)** — matches the systemd timer being replaced.
- **Passwords never leave the server.** `encPassword` must never appear in any action return value, audit `detail`, audit `payload`, or log line.
- **Credentials are encrypted with `src/lib/crypto.ts`** (`encrypt`/`decrypt`, AES-256-GCM, requires 64-char hex `ENCRYPTION_KEY`).
- **Existing `POST /api/cron/resync` request/response contract must not change** — the live systemd unit depends on it during migration.
- **Tests are pure-function unit tests.** No test in this repo mocks Prisma; do not introduce a DB test harness. Extract pure logic and test that.
- **Follow `src/actions/apic-hosts.ts` conventions** for server actions: `ActionResult<T>`, `requireAdmin()`, `recordAudit()`, `cache()`, `toSafe()`.
- **Use class constants from `src/lib/ui-classes.ts`** (`INPUT_CLS`, `SELECT_CLS`, `LABEL_CLS`, `TABLE_SCROLL_CLS`); never redefine them locally.
- Run `bun test` and `bun run lint` before every commit.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/apic/schedule-timing.ts` (create) | Pure timing logic: due check, next-run math, stale-claim check, constants |
| `src/lib/apic/schedule-timing.test.ts` (create) | Tests for the above |
| `src/lib/crypto.test.ts` (create) | Roundtrip + tamper-rejection for the now load-bearing crypto module |
| `src/lib/schemas/resync-schedule.ts` (create) | zod schemas + form value types |
| `src/lib/schemas/resync-schedule.test.ts` (create) | Interval bound + credential validation tests |
| `prisma/schema.prisma` (modify) | `ResyncSchedule` model, `ApicHost.schedule` back-relation |
| `src/lib/apic/resync-host.ts` (create) | `resyncHost()` — all four datasets for one host, extracted from the cron route |
| `src/app/api/cron/resync/route.ts` (modify) | Becomes a thin wrapper over `resyncHost()`; contract unchanged |
| `src/app/api/cron/tick/route.ts` (create) | Claim-one-run-one-finalize loop |
| `src/lib/apic/schedule-claim.ts` (create) | The raw claim/finalize SQL, isolated from the route |
| `src/actions/resync-schedules.ts` (create) | Admin CRUD server actions + `toSafe` |
| `src/actions/resync-schedules.test.ts` (create) | `toSafe` leak-proofing |
| `src/lib/audit.ts` (modify) | Add schedule actions to the `AuditAction` union |
| `src/app/(app)/scheduler/page.tsx` (create) | Admin-gated server component |
| `src/app/(app)/scheduler/SchedulerClient.tsx` (create) | Table + edit dialog |
| `src/components/AppSidebar.tsx` (modify) | Nav entry, `adminOnly: true` |
| `scheduler/tick.sh` (create) | Ticker loop script |
| `README.md`, `content/docs/admin/scheduled-resync.mdx` (modify) | Docs + corrected security claims |

**Out of scope for this branch:** adding the `scheduler` service to `docker-compose.yml`. `main`'s compose has no `app` service — it exists only on `feat/docker-compose-deployment`. Task 9 ships `scheduler/tick.sh` and documents the compose snippet; wiring it in happens when that branch merges.

---

### Task 1: Schedule timing primitives

Pure functions with no DB or clock dependency — every function takes `now` explicitly so tests are deterministic.

**Files:**
- Create: `src/lib/apic/schedule-timing.ts`
- Test: `src/lib/apic/schedule-timing.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `INTERVAL_MIN_MINUTES = 15`, `INTERVAL_MAX_MINUTES = 10080`, `DEFAULT_INTERVAL_MINUTES = 480`, `STALE_CLAIM_MINUTES = 120`
  - `computeNextRunAt(completedAt: Date, intervalMinutes: number): Date`
  - `isClaimStale(runningAt: Date | null, now: Date, staleAfterMinutes?: number): boolean`
  - `isScheduleDue(s: { enabled: boolean; nextRunAt: Date | null; runningAt: Date | null }, now: Date, staleAfterMinutes?: number): boolean`
  - `isScheduleOverdue(s: { enabled: boolean; nextRunAt: Date | null; intervalMinutes: number }, now: Date): boolean`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/apic/schedule-timing.test.ts
import { describe, expect, it } from 'bun:test'
import {
  DEFAULT_INTERVAL_MINUTES,
  INTERVAL_MAX_MINUTES,
  INTERVAL_MIN_MINUTES,
  STALE_CLAIM_MINUTES,
  computeNextRunAt,
  isClaimStale,
  isScheduleDue,
  isScheduleOverdue,
} from './schedule-timing'

const T0 = new Date('2026-08-17T12:00:00.000Z')
const min = (n: number) => new Date(T0.getTime() + n * 60_000)

describe('constants', () => {
  it('matches the spec bounds', () => {
    expect(INTERVAL_MIN_MINUTES).toBe(15)
    expect(INTERVAL_MAX_MINUTES).toBe(10080)
    expect(DEFAULT_INTERVAL_MINUTES).toBe(480)
    expect(STALE_CLAIM_MINUTES).toBe(120)
  })
})

describe('computeNextRunAt', () => {
  it('adds the interval to the completion time', () => {
    expect(computeNextRunAt(T0, 480).toISOString()).toBe('2026-08-17T20:00:00.000Z')
  })

  it('measures from completion, not from the scheduled time', () => {
    const lateCompletion = min(37)
    expect(computeNextRunAt(lateCompletion, 60).toISOString()).toBe('2026-08-17T13:37:00.000Z')
  })

  it('throws on a non-positive interval', () => {
    expect(() => computeNextRunAt(T0, 0)).toThrow()
    expect(() => computeNextRunAt(T0, -5)).toThrow()
  })
})

describe('isClaimStale', () => {
  it('treats an unclaimed row as not stale', () => {
    expect(isClaimStale(null, T0)).toBe(false)
  })

  it('is false just inside the window', () => {
    expect(isClaimStale(T0, min(119))).toBe(false)
  })

  it('is false exactly at the boundary', () => {
    expect(isClaimStale(T0, min(120))).toBe(false)
  })

  it('is true just outside the window', () => {
    expect(isClaimStale(T0, min(121))).toBe(true)
  })

  it('honours a custom window', () => {
    expect(isClaimStale(T0, min(31), 30)).toBe(true)
    expect(isClaimStale(T0, min(29), 30)).toBe(false)
  })
})

describe('isScheduleDue', () => {
  const base = { enabled: true, nextRunAt: T0, runningAt: null }

  it('is due when nextRunAt has passed', () => {
    expect(isScheduleDue(base, min(1))).toBe(true)
  })

  it('is due exactly at nextRunAt', () => {
    expect(isScheduleDue(base, T0)).toBe(true)
  })

  it('is not due before nextRunAt', () => {
    expect(isScheduleDue(base, min(-1))).toBe(false)
  })

  it('is never due when disabled', () => {
    expect(isScheduleDue({ ...base, enabled: false }, min(60))).toBe(false)
  })

  it('is not due when nextRunAt is null', () => {
    expect(isScheduleDue({ ...base, nextRunAt: null }, min(60))).toBe(false)
  })

  it('is not due while a fresh claim is held', () => {
    expect(isScheduleDue({ ...base, runningAt: min(5) }, min(10))).toBe(false)
  })

  it('becomes due again once the claim goes stale', () => {
    expect(isScheduleDue({ ...base, runningAt: T0 }, min(121))).toBe(true)
  })
})

describe('isScheduleOverdue', () => {
  const base = { enabled: true, nextRunAt: T0, intervalMinutes: 60 }

  it('is not overdue within 2x the interval', () => {
    expect(isScheduleOverdue(base, min(119))).toBe(false)
  })

  it('is overdue past 2x the interval', () => {
    expect(isScheduleOverdue(base, min(121))).toBe(true)
  })

  it('is never overdue when disabled', () => {
    expect(isScheduleOverdue({ ...base, enabled: false }, min(10_000))).toBe(false)
  })

  it('is not overdue when never scheduled', () => {
    expect(isScheduleOverdue({ ...base, nextRunAt: null }, min(10_000))).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/apic/schedule-timing.test.ts`
Expected: FAIL — `Cannot find module './schedule-timing'`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/apic/schedule-timing.ts

/** Smallest interval an operator may configure — guards the APICs from being hammered. */
export const INTERVAL_MIN_MINUTES = 15
/** Largest interval an operator may configure (1 week). */
export const INTERVAL_MAX_MINUTES = 10080
/** Default for a new schedule — matches the systemd timer this replaces. */
export const DEFAULT_INTERVAL_MINUTES = 480
/**
 * A claim older than this is treated as abandoned (container died mid-run).
 * Must exceed the longest plausible single-host resync.
 */
export const STALE_CLAIM_MINUTES = 120

const MINUTE_MS = 60_000

/** Next run is measured from when the previous run *finished*, not when it was due. */
export function computeNextRunAt(completedAt: Date, intervalMinutes: number): Date {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
    throw new Error('intervalMinutes must be a positive number')
  }
  return new Date(completedAt.getTime() + intervalMinutes * MINUTE_MS)
}

/** True when a held claim is old enough to be considered abandoned. */
export function isClaimStale(
  runningAt: Date | null,
  now: Date,
  staleAfterMinutes: number = STALE_CLAIM_MINUTES,
): boolean {
  if (!runningAt) return false
  return now.getTime() - runningAt.getTime() > staleAfterMinutes * MINUTE_MS
}

/**
 * Mirror of the SQL claim predicate in schedule-claim.ts.
 * Kept pure so the rules are unit-tested; the SQL is the enforcement point.
 */
export function isScheduleDue(
  schedule: { enabled: boolean; nextRunAt: Date | null; runningAt: Date | null },
  now: Date,
  staleAfterMinutes: number = STALE_CLAIM_MINUTES,
): boolean {
  if (!schedule.enabled) return false
  if (!schedule.nextRunAt) return false
  if (schedule.nextRunAt.getTime() > now.getTime()) return false
  if (schedule.runningAt && !isClaimStale(schedule.runningAt, now, staleAfterMinutes)) return false
  return true
}

/**
 * True when an enabled schedule is more than 2x its interval late — surfaced in the UI
 * so a dead ticker is distinguishable from a healthy idle one.
 */
export function isScheduleOverdue(
  schedule: { enabled: boolean; nextRunAt: Date | null; intervalMinutes: number },
  now: Date,
): boolean {
  if (!schedule.enabled || !schedule.nextRunAt) return false
  const graceMs = 2 * schedule.intervalMinutes * MINUTE_MS
  return now.getTime() - schedule.nextRunAt.getTime() > graceMs
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/apic/schedule-timing.test.ts`
Expected: PASS (all cases)

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/schedule-timing.ts src/lib/apic/schedule-timing.test.ts
git commit -m "feat: add resync schedule timing primitives"
```

---

### Task 2: Crypto tests and the schedule zod schema

`src/lib/crypto.ts` is currently imported by nothing and has no tests. It becomes load-bearing here, so it gets covered first.

**Files:**
- Create: `src/lib/crypto.test.ts`
- Create: `src/lib/schemas/resync-schedule.ts`
- Create: `src/lib/schemas/resync-schedule.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` from `src/lib/crypto.ts`; interval constants from Task 1
- Produces:
  - `resyncScheduleSchema` — requires `username` + `password`
  - `resyncScheduleUpdateSchema` — `password` optional (omitted means keep existing)
  - `type ResyncScheduleFormValues`, `type ResyncScheduleUpdateFormValues`

- [ ] **Step 1: Write the failing crypto tests**

```ts
// src/lib/crypto.test.ts
import { beforeAll, describe, expect, it } from 'bun:test'
import { decrypt, encrypt } from './crypto'

const KEY = 'a'.repeat(64)

beforeAll(() => {
  process.env.ENCRYPTION_KEY = KEY
})

describe('encrypt/decrypt', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('P@ssw0rd123'))).toBe('P@ssw0rd123')
  })

  it('round-trips unicode and empty strings', () => {
    expect(decrypt(encrypt('pässwörd–✓'))).toBe('pässwörd–✓')
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('produces a different ciphertext each time (random IV)', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'))
  })

  it('rejects a tampered auth tag', () => {
    const [iv, tag, data] = encrypt('secret').split(':')
    const flipped = tag.startsWith('0') ? `1${tag.slice(1)}` : `0${tag.slice(1)}`
    expect(() => decrypt(`${iv}:${flipped}:${data}`)).toThrow()
  })

  it('rejects tampered ciphertext', () => {
    const [iv, tag, data] = encrypt('secret').split(':')
    const flipped = data.startsWith('0') ? `1${data.slice(1)}` : `0${data.slice(1)}`
    expect(() => decrypt(`${iv}:${tag}:${flipped}`)).toThrow()
  })

  it('rejects a malformed payload', () => {
    expect(() => decrypt('not-encrypted')).toThrow('Invalid encrypted value')
  })

  it('rejects a wrong-length key', () => {
    process.env.ENCRYPTION_KEY = 'tooshort'
    expect(() => encrypt('x')).toThrow('ENCRYPTION_KEY')
    process.env.ENCRYPTION_KEY = KEY
  })
})
```

- [ ] **Step 2: Run to verify the crypto tests fail or pass honestly**

Run: `bun test src/lib/crypto.test.ts`
Expected: PASS — `crypto.ts` already exists and should satisfy all of these. If any case fails, fix `crypto.ts` rather than weakening the test. (This task documents and locks existing behavior before depending on it.)

- [ ] **Step 3: Write the failing schema tests**

```ts
// src/lib/schemas/resync-schedule.test.ts
import { describe, expect, it } from 'bun:test'
import { resyncScheduleSchema, resyncScheduleUpdateSchema } from './resync-schedule'

const valid = { enabled: true, intervalMinutes: 480, username: 'svc-apic', password: 'hunter22' }

describe('resyncScheduleSchema', () => {
  it('accepts a valid payload', () => {
    expect(resyncScheduleSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects an interval below the floor', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, intervalMinutes: 14 }).success).toBe(false)
  })

  it('accepts exactly the floor', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, intervalMinutes: 15 }).success).toBe(true)
  })

  it('accepts exactly the ceiling', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, intervalMinutes: 10080 }).success).toBe(true)
  })

  it('rejects an interval above the ceiling', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, intervalMinutes: 10081 }).success).toBe(false)
  })

  it('rejects a non-integer interval', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, intervalMinutes: 20.5 }).success).toBe(false)
  })

  it('rejects a blank username', () => {
    expect(resyncScheduleSchema.safeParse({ ...valid, username: '   ' }).success).toBe(false)
  })

  it('trims the username', () => {
    const parsed = resyncScheduleSchema.parse({ ...valid, username: '  svc-apic  ' })
    expect(parsed.username).toBe('svc-apic')
  })

  it('requires a password', () => {
    const { password: _omitted, ...rest } = valid
    expect(resyncScheduleSchema.safeParse(rest).success).toBe(false)
  })
})

describe('resyncScheduleUpdateSchema', () => {
  it('allows password to be omitted', () => {
    const { password: _omitted, ...rest } = valid
    expect(resyncScheduleUpdateSchema.safeParse(rest).success).toBe(true)
  })

  it('treats an empty password as omitted', () => {
    const parsed = resyncScheduleUpdateSchema.parse({ ...valid, password: '' })
    expect(parsed.password).toBeUndefined()
  })

  it('still validates the interval', () => {
    expect(resyncScheduleUpdateSchema.safeParse({ ...valid, intervalMinutes: 1 }).success).toBe(false)
  })
})
```

- [ ] **Step 4: Run to verify they fail**

Run: `bun test src/lib/schemas/resync-schedule.test.ts`
Expected: FAIL — `Cannot find module './resync-schedule'`

- [ ] **Step 5: Write the schema**

```ts
// src/lib/schemas/resync-schedule.ts
import { z } from 'zod'
import { INTERVAL_MAX_MINUTES, INTERVAL_MIN_MINUTES } from '@/lib/apic/schedule-timing'

const intervalMinutes = z
  .number()
  .int('Interval must be a whole number of minutes')
  .min(INTERVAL_MIN_MINUTES, `Interval must be at least ${INTERVAL_MIN_MINUTES} minutes`)
  .max(INTERVAL_MAX_MINUTES, `Interval must be ${INTERVAL_MAX_MINUTES} minutes or fewer`)

const username = z
  .string()
  .trim()
  .min(1, 'Username is required')
  .max(128, 'Username must be 128 characters or fewer')

const password = z.string().min(1, 'Password is required').max(256, 'Password is too long')

export const resyncScheduleSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes,
  username,
  password,
})

/** Update form: an omitted or blank password means "keep the stored one". */
export const resyncScheduleUpdateSchema = z.object({
  enabled: z.boolean(),
  intervalMinutes,
  username,
  password: z
    .string()
    .max(256, 'Password is too long')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
})

export type ResyncScheduleFormValues = z.infer<typeof resyncScheduleSchema>
export type ResyncScheduleUpdateFormValues = z.infer<typeof resyncScheduleUpdateSchema>
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `bun test src/lib/crypto.test.ts src/lib/schemas/resync-schedule.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/lib/crypto.test.ts src/lib/schemas/resync-schedule.ts src/lib/schemas/resync-schedule.test.ts
git commit -m "feat: add resync schedule validation schema and crypto tests"
```

---

### Task 3: Prisma model and migration

**Files:**
- Modify: `prisma/schema.prisma` (add model; add back-relation to `ApicHost` around line 99-117)
- Create: `prisma/migrations/<timestamp>_add_resync_schedule/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing
- Produces: Prisma model `ResyncSchedule`, accessible as `prisma.resyncSchedule`; `ApicHost.schedule` relation

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

Append after the `ApicHost` model:

```prisma
model ResyncSchedule {
  id              String    @id @default(cuid())
  apicHostId      String    @unique
  apicHost        ApicHost  @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  enabled         Boolean   @default(false)
  intervalMinutes Int       @default(480)
  encUsername     String
  encPassword     String
  nextRunAt       DateTime?
  lastRunAt       DateTime?
  lastStatus      String?
  lastDetail      String?
  runningAt       DateTime?
  updatedByUserId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([enabled, nextRunAt])
  @@map("resync_schedule")
}
```

- [ ] **Step 2: Add the back-relation to `ApicHost`**

Inside the existing `model ApicHost`, alongside the other relation fields (`endpoints`, `interfaces`, …), add:

```prisma
  schedule            ResyncSchedule?
```

- [ ] **Step 3: Generate the migration**

Run: `bun run prisma:migrate --name add_resync_schedule`
Expected: a new folder under `prisma/migrations/` containing `CREATE TABLE "resync_schedule"`, a unique index on `apicHostId`, and the `(enabled, nextRunAt)` index.

- [ ] **Step 4: Verify the client picks up the model**

Run: `bun run prisma:generate && bunx tsc --noEmit`
Expected: no type errors; `prisma.resyncSchedule` is available.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add ResyncSchedule model and migration"
```

---

### Task 4: Extract `resyncHost()`

Pure refactor — behavior and the HTTP contract must not change. The existing `/api/cron/resync` body moves into a reusable lib function so the tick route can share it.

**Files:**
- Create: `src/lib/apic/resync-host.ts`
- Modify: `src/app/api/cron/resync/route.ts` (replace the per-host loop body, lines ~44-169)

**Interfaces:**
- Consumes: `resyncEndpoints`, `resyncInterfaces`, `resyncNodes`, `resyncEpgs`; `HostResult`/`DatasetResult` and `summarizeResults` from `./cron-resync`; `recordAudit`
- Produces:
  - `resyncHost(input: { apicHostId: string; hostName: string; host: string; username: string; password: string }): Promise<HostResult>` — never throws; per-dataset failures are captured into the returned `HostResult` and audited

- [ ] **Step 1: Write `src/lib/apic/resync-host.ts`**

Move the four dataset blocks verbatim out of the route, parameterized by host identity:

```ts
// src/lib/apic/resync-host.ts
import { recordAudit } from '@/lib/audit'
import { resyncEndpoints } from '@/lib/apic/endpoints'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import { resyncNodes } from '@/lib/apic/nodes'
import { resyncEpgs } from '@/lib/apic/epg-resync'
import type { DatasetResult, HostResult } from '@/lib/apic/cron-resync'

export interface ResyncHostInput {
  apicHostId: string
  /** Display name, used as the audit target. */
  hostName: string
  /** Reachable address of the APIC. */
  host: string
  username: string
  password: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Resync all four datasets for a single host, auditing each one as `scheduler`.
 * Never throws: every dataset failure is captured in the returned HostResult.
 */
export async function resyncHost(input: ResyncHostInput): Promise<HostResult> {
  const { apicHostId, hostName, host, username, password } = input
  const target = `${hostName} (${host})`
  const creds = { apicHostId, host, username, password }
  const result: HostResult = { apicHostId, host: hostName }

  // Endpoints
  let endpoints: DatasetResult
  try {
    endpoints = await resyncEndpoints(creds)
  } catch (err) {
    endpoints = { error: errorMessage(err, 'Failed to resync endpoints') }
  }
  result.endpoints = endpoints
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.endpoints',
    target,
    status: 'error' in endpoints ? 'failure' : 'success',
    detail: 'error' in endpoints
      ? endpoints.error
      : `synced ${endpoints.synced} (total ${endpoints.total})`,
  })

  // Interfaces
  let interfaces: DatasetResult
  try {
    interfaces = await resyncInterfaces(creds)
  } catch (err) {
    interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
  }
  result.interfaces = interfaces
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.interfaces',
    target,
    status: 'error' in interfaces ? 'failure' : 'success',
    detail: 'error' in interfaces
      ? interfaces.error
      : `synced ${interfaces.synced} (total ${interfaces.total})`,
  })

  // Nodes & hardware
  let nodes: DatasetResult
  try {
    const r = await resyncNodes(creds)
    nodes = { synced: r.syncedNodes, total: r.syncedNodes + r.syncedComponents }
  } catch (err) {
    nodes = { error: errorMessage(err, 'Failed to resync nodes') }
  }
  result.nodes = nodes
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.nodes',
    target,
    status: 'error' in nodes ? 'failure' : 'success',
    detail: 'error' in nodes
      ? nodes.error
      : `synced ${nodes.synced} nodes (total ${nodes.total})`,
  })

  // EPGs & static port bindings
  let epgs: DatasetResult
  try {
    const r = await resyncEpgs(creds)
    epgs = { synced: r.syncedEpgs, total: r.syncedEpgs + r.syncedBindings }
  } catch (err) {
    epgs = { error: errorMessage(err, 'Failed to resync EPGs') }
  }
  result.epgs = epgs
  await recordAudit({
    userId: null,
    userName: 'scheduler',
    action: 'resync.epgs',
    target,
    status: 'error' in epgs ? 'failure' : 'success',
    detail: 'error' in epgs
      ? epgs.error
      : `synced ${epgs.synced} EPGs (total ${epgs.total})`,
  })

  return result
}
```

- [ ] **Step 2: Rewrite the cron route to use it**

Replace the whole per-host loop in `src/app/api/cron/resync/route.ts` with a call to `resyncHost`, keeping the validation and response shape byte-identical:

```ts
  const results: HostResult[] = []

  for (const entry of hosts) {
    const apicHostId = entry?.apicHostId
    const username = entry?.username
    const password = entry?.password

    if (!apicHostId || !username?.trim() || !password) {
      results.push({
        apicHostId: apicHostId ?? null,
        host: null,
        error: 'apicHostId, username and password are required',
      })
      continue
    }

    const apicHost = await prisma.apicHost.findFirst({ where: { id: apicHostId } })
    if (!apicHost) {
      results.push({ apicHostId, host: null, error: 'Host not found' })
      continue
    }

    results.push(
      await resyncHost({
        apicHostId,
        hostName: apicHost.name,
        host: apicHost.host,
        username: username.trim(),
        password,
      }),
    )
  }

  return Response.json({ status: summarizeResults(results), results })
```

Delete the now-unused imports (`resyncEndpoints`, `resyncInterfaces`, `resyncNodes`, `resyncEpgs`, `recordAudit`, the local `errorMessage`, `DatasetResult`) and import `resyncHost` instead. Keep `prisma`, `isAuthorized`, `summarizeResults`, and `HostResult`.

- [ ] **Step 3: Verify nothing regressed**

Run: `bun test && bun run lint && bunx tsc --noEmit`
Expected: PASS. `src/lib/apic/cron-resync.test.ts` still covers `isAuthorized` / `summarizeResults` unchanged.

- [ ] **Step 4: Manually confirm the contract is intact**

Read `src/app/api/cron/resync/route.ts` top to bottom and confirm: `503` when `SCHEDULER_TOKEN` is unset, `401` on a bad token, `400` on an invalid body or empty `hosts`, and the response is still `{ status, results }` with the same per-host keys. This route is what the live systemd timer calls — a changed shape breaks production.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/resync-host.ts src/app/api/cron/resync/route.ts
git commit -m "refactor: extract resyncHost() from the cron resync route"
```

---

### Task 5: Claim and finalize SQL

Isolated from the route so the route stays readable and the SQL is reviewable in one place.

**Files:**
- Create: `src/lib/apic/schedule-claim.ts`

**Interfaces:**
- Consumes: `prisma`; `STALE_CLAIM_MINUTES`, `computeNextRunAt` from Task 1
- Produces:
  - `type ClaimedSchedule = { id: string; apicHostId: string; encUsername: string; encPassword: string; intervalMinutes: number; hostName: string; host: string }`
  - `claimNextDueSchedule(now?: Date): Promise<ClaimedSchedule | null>`
  - `finalizeSchedule(input: { id: string; intervalMinutes: number; status: 'success' | 'partial' | 'failure'; detail: string; completedAt?: Date }): Promise<void>`

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/apic/schedule-claim.ts
import { prisma } from '@/lib/prisma'
import { STALE_CLAIM_MINUTES, computeNextRunAt } from './schedule-timing'

export interface ClaimedSchedule {
  id: string
  apicHostId: string
  encUsername: string
  encPassword: string
  intervalMinutes: number
  hostName: string
  host: string
}

/**
 * Atomically claim the single most-overdue due schedule.
 *
 * One statement, so two overlapping ticks can never claim the same row. We claim one row
 * per call rather than all due rows at once: bulk-claiming would stamp `runningAt` on rows
 * that then wait behind earlier hosts, and once that wait exceeds the stale window another
 * tick would reclaim and double-run them.
 */
export async function claimNextDueSchedule(now: Date = new Date()): Promise<ClaimedSchedule | null> {
  const rows = await prisma.$queryRaw<ClaimedSchedule[]>`
    UPDATE resync_schedule AS s
       SET "runningAt" = ${now}
     WHERE s.id = (
       SELECT c.id
         FROM resync_schedule AS c
        WHERE c.enabled
          AND c."nextRunAt" IS NOT NULL
          AND c."nextRunAt" <= ${now}
          AND (
            c."runningAt" IS NULL
            OR c."runningAt" < ${new Date(now.getTime() - STALE_CLAIM_MINUTES * 60_000)}
          )
        ORDER BY c."nextRunAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING
      s.id,
      s."apicHostId",
      s."encUsername",
      s."encPassword",
      s."intervalMinutes",
      (SELECT h.name FROM apic_host AS h WHERE h.id = s."apicHostId") AS "hostName",
      (SELECT h.host FROM apic_host AS h WHERE h.id = s."apicHostId") AS "host"
  `
  return rows[0] ?? null
}

/** Record the outcome, schedule the next run, and release the claim. */
export async function finalizeSchedule(input: {
  id: string
  intervalMinutes: number
  status: 'success' | 'partial' | 'failure'
  detail: string
  completedAt?: Date
}): Promise<void> {
  const completedAt = input.completedAt ?? new Date()
  await prisma.resyncSchedule.update({
    where: { id: input.id },
    data: {
      lastRunAt: completedAt,
      lastStatus: input.status,
      lastDetail: input.detail.slice(0, 1000),
      nextRunAt: computeNextRunAt(completedAt, input.intervalMinutes),
      runningAt: null,
    },
  })
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `bunx tsc --noEmit && bun run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/apic/schedule-claim.ts
git commit -m "feat: add atomic schedule claim and finalize helpers"
```

---

### Task 6: The tick endpoint

**Files:**
- Create: `src/app/api/cron/tick/route.ts`

**Interfaces:**
- Consumes: `isAuthorized`, `summarizeResults` from `@/lib/apic/cron-resync`; `resyncHost` (Task 4); `claimNextDueSchedule`, `finalizeSchedule` (Task 5); `decrypt`; `recordAudit`
- Produces: `POST /api/cron/tick` → `200 { ran: number; results: Array<{ apicHostId: string; host: string; status: string }> }`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/cron/tick/route.ts
import { recordAudit } from '@/lib/audit'
import { decrypt } from '@/lib/crypto'
import { isAuthorized, summarizeResults } from '@/lib/apic/cron-resync'
import { claimNextDueSchedule, finalizeSchedule } from '@/lib/apic/schedule-claim'
import { resyncHost } from '@/lib/apic/resync-host'

/** Safety valve: never work through more than this many schedules in one tick. */
const MAX_PER_TICK = 20

export async function POST(request: Request) {
  const token = process.env.SCHEDULER_TOKEN
  if (!token) {
    return Response.json({ error: 'Scheduler endpoint is not configured' }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Array<{ apicHostId: string; host: string; status: string }> = []

  for (let i = 0; i < MAX_PER_TICK; i += 1) {
    const claimed = await claimNextDueSchedule()
    if (!claimed) break

    let status: 'success' | 'partial' | 'failure' = 'failure'
    let detail = ''

    try {
      // A single undecryptable row must not stop the other hosts.
      let username: string
      let password: string
      try {
        username = decrypt(claimed.encUsername)
        password = decrypt(claimed.encPassword)
      } catch {
        detail = 'Credential decryption failed — re-enter the credentials for this host'
        await recordAudit({
          userId: null,
          userName: 'scheduler',
          action: 'resync.schedule.run',
          target: `${claimed.hostName} (${claimed.host})`,
          status: 'failure',
          detail,
        })
        continue
      }

      const hostResult = await resyncHost({
        apicHostId: claimed.apicHostId,
        hostName: claimed.hostName,
        host: claimed.host,
        username,
        password,
      })
      status = summarizeResults([hostResult])
      detail = describeResult(hostResult)
    } catch (err) {
      detail = err instanceof Error ? err.message : 'Scheduled resync failed'
    } finally {
      // Always release the claim and set the next run, even on a throw.
      await finalizeSchedule({
        id: claimed.id,
        intervalMinutes: claimed.intervalMinutes,
        status,
        detail,
      })
    }

    results.push({ apicHostId: claimed.apicHostId, host: claimed.hostName, status })
  }

  return Response.json({ ran: results.length, results })
}

function describeResult(result: {
  endpoints?: unknown
  interfaces?: unknown
  nodes?: unknown
  epgs?: unknown
}): string {
  const parts: string[] = []
  for (const [name, value] of Object.entries(result)) {
    if (!value || typeof value !== 'object') continue
    if ('error' in value) parts.push(`${name}: ${(value as { error: string }).error}`)
    else if ('synced' in value) parts.push(`${name}: ${(value as { synced: number }).synced}`)
  }
  return parts.join('; ')
}
```

Note the `continue` inside `try` still runs the `finally`, so a decryption failure both audits and finalizes (marking that host failed and pushing `nextRunAt` forward) without wedging the row.

- [ ] **Step 2: Add the new audit action**

In `src/lib/audit.ts`, extend the `AuditAction` union with the three actions used by this task and Task 7:

```ts
  | 'resync.schedule.run'
  | 'resync_schedule.update'
  | 'resync_schedule.delete'
```

- [ ] **Step 3: Verify it typechecks and lints**

Run: `bunx tsc --noEmit && bun run lint && bun test`
Expected: PASS.

- [ ] **Step 4: Verify auth behavior by hand**

Start the app (`bun run dev`) with `SCHEDULER_TOKEN` set in `.env` and confirm:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/cron/tick                      # 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/cron/tick -H 'Authorization: Bearer wrong'   # 401
curl -s -X POST localhost:3000/api/cron/tick -H "Authorization: Bearer $SCHEDULER_TOKEN"           # {"ran":0,"results":[]}
```

Expected: `401`, `401`, then `{"ran":0,"results":[]}` (no schedules exist yet).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/tick/route.ts src/lib/audit.ts
git commit -m "feat: add /api/cron/tick scheduler endpoint"
```

---

### Task 7: Server actions

**Files:**
- Create: `src/actions/resync-schedules.ts`
- Test: `src/actions/resync-schedules.test.ts`

**Interfaces:**
- Consumes: schemas (Task 2), timing helpers (Task 1), `encrypt`/`decrypt`, `prisma`, `recordAudit`, `getSession`
- Produces:
  - `type SafeResyncSchedule` (exact shape below)
  - `toSafeSchedule(host, schedule)` — exported for testing
  - `getResyncSchedules(): Promise<SafeResyncSchedule[]>`
  - `upsertResyncSchedule(apicHostId, values): Promise<ActionResult<SafeResyncSchedule>>`
  - `runResyncScheduleNow(apicHostId): Promise<ActionResult<void>>`
  - `deleteResyncSchedule(apicHostId): Promise<ActionResult<void>>`

- [ ] **Step 1: Write the failing test**

```ts
// src/actions/resync-schedules.test.ts
import { describe, expect, it } from 'bun:test'
import { toSafeSchedule } from './resync-schedules'

const host = { id: 'host-1', name: 'DC-APIC-01', host: '10.0.0.1' }
const T0 = new Date('2026-08-17T12:00:00.000Z')

const row = {
  id: 'sched-1',
  apicHostId: 'host-1',
  enabled: true,
  intervalMinutes: 480,
  encUsername: 'ENCRYPTED_USERNAME',
  encPassword: 'ENCRYPTED_PASSWORD',
  nextRunAt: new Date('2026-08-17T20:00:00.000Z'),
  lastRunAt: T0,
  lastStatus: 'success',
  lastDetail: 'endpoints: 12',
  runningAt: null,
}

describe('toSafeSchedule', () => {
  it('never exposes the encrypted password or username ciphertext', () => {
    const safe = toSafeSchedule(host, row, () => 'svc-apic')
    const serialized = JSON.stringify(safe)
    expect(serialized).not.toContain('ENCRYPTED_PASSWORD')
    expect(serialized).not.toContain('ENCRYPTED_USERNAME')
    expect(Object.keys(safe)).not.toContain('encPassword')
    expect(Object.keys(safe)).not.toContain('encUsername')
  })

  it('reports hasPassword instead of the password', () => {
    const safe = toSafeSchedule(host, row, () => 'svc-apic')
    expect(safe.hasPassword).toBe(true)
    expect(safe.username).toBe('svc-apic')
  })

  it('marks a running schedule', () => {
    const safe = toSafeSchedule(host, { ...row, runningAt: T0 }, () => 'svc-apic')
    expect(safe.isRunning).toBe(true)
  })

  it('falls back to a placeholder when the username cannot be decrypted', () => {
    const safe = toSafeSchedule(host, row, () => {
      throw new Error('bad key')
    })
    expect(safe.username).toBe('(unreadable)')
    expect(JSON.stringify(safe)).not.toContain('ENCRYPTED_USERNAME')
  })

  it('describes an unscheduled host', () => {
    const safe = toSafeSchedule(host, null, () => 'svc-apic')
    expect(safe.enabled).toBe(false)
    expect(safe.hasPassword).toBe(false)
    expect(safe.nextRunAt).toBeNull()
    expect(safe.hostName).toBe('DC-APIC-01')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/actions/resync-schedules.test.ts`
Expected: FAIL — `Cannot find module './resync-schedules'`

- [ ] **Step 3: Write the actions**

`toSafeSchedule` takes the decrypt function as a parameter so it is testable without `ENCRYPTION_KEY`.

```ts
// src/actions/resync-schedules.ts
'use server'

import { cache } from 'react'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { decrypt, encrypt } from '@/lib/crypto'
import { DEFAULT_INTERVAL_MINUTES, isScheduleOverdue } from '@/lib/apic/schedule-timing'
import {
  resyncScheduleUpdateSchema,
  type ResyncScheduleUpdateFormValues,
} from '@/lib/schemas/resync-schedule'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeResyncSchedule = {
  apicHostId: string
  hostName: string
  host: string
  enabled: boolean
  intervalMinutes: number
  username: string
  hasPassword: boolean
  lastRunAt: Date | null
  lastStatus: string | null
  lastDetail: string | null
  nextRunAt: Date | null
  isRunning: boolean
  isOverdue: boolean
}

type ScheduleRow = {
  enabled: boolean
  intervalMinutes: number
  encUsername: string
  encPassword: string
  nextRunAt: Date | null
  lastRunAt: Date | null
  lastStatus: string | null
  lastDetail: string | null
  runningAt: Date | null
}

async function requireAdmin(): Promise<{ id: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  if ((session.user.role ?? 'member') !== 'admin') throw new Error('Forbidden')
  return {
    id: session.user.id,
    userName: session.user.username ?? session.user.name,
  }
}

/**
 * Serialization boundary. Ciphertext must never cross it — `decryptFn` is injected so this
 * stays a pure function under test.
 */
export function toSafeSchedule(
  host: { id: string; name: string; host: string },
  schedule: ScheduleRow | null,
  decryptFn: (value: string) => string = decrypt,
  now: Date = new Date(),
): SafeResyncSchedule {
  if (!schedule) {
    return {
      apicHostId: host.id,
      hostName: host.name,
      host: host.host,
      enabled: false,
      intervalMinutes: DEFAULT_INTERVAL_MINUTES,
      username: '',
      hasPassword: false,
      lastRunAt: null,
      lastStatus: null,
      lastDetail: null,
      nextRunAt: null,
      isRunning: false,
      isOverdue: false,
    }
  }

  let username: string
  try {
    username = decryptFn(schedule.encUsername)
  } catch {
    username = '(unreadable)'
  }

  return {
    apicHostId: host.id,
    hostName: host.name,
    host: host.host,
    enabled: schedule.enabled,
    intervalMinutes: schedule.intervalMinutes,
    username,
    hasPassword: schedule.encPassword.length > 0,
    lastRunAt: schedule.lastRunAt,
    lastStatus: schedule.lastStatus,
    lastDetail: schedule.lastDetail,
    nextRunAt: schedule.nextRunAt,
    isRunning: schedule.runningAt !== null,
    isOverdue: isScheduleOverdue(
      { enabled: schedule.enabled, nextRunAt: schedule.nextRunAt, intervalMinutes: schedule.intervalMinutes },
      now,
    ),
  }
}

async function _getResyncSchedules(): Promise<SafeResyncSchedule[]> {
  await requireAdmin()
  const hosts = await prisma.apicHost.findMany({
    orderBy: { createdAt: 'asc' },
    include: { schedule: true },
  })
  return hosts.map((h) => toSafeSchedule({ id: h.id, name: h.name, host: h.host }, h.schedule))
}

/** Cached per-request: safe to call from multiple server components. */
export const getResyncSchedules = cache(_getResyncSchedules)

export async function upsertResyncSchedule(
  apicHostId: string,
  data: ResyncScheduleUpdateFormValues,
): Promise<ActionResult<SafeResyncSchedule>> {
  try {
    const actor = await requireAdmin()
    const parsed = resyncScheduleUpdateSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid data' }
    }
    const host = await prisma.apicHost.findUnique({
      where: { id: apicHostId },
      include: { schedule: true },
    })
    if (!host) return { success: false, error: 'Host not found' }

    const { enabled, intervalMinutes, username, password } = parsed.data
    if (!password && !host.schedule) {
      return { success: false, error: 'Password is required when creating a schedule' }
    }
    if (enabled && !password && !host.schedule?.encPassword) {
      return { success: false, error: 'Credentials are required before enabling a schedule' }
    }

    const encUsername = encrypt(username)
    const encPassword = password ? encrypt(password) : host.schedule!.encPassword

    // Enabling for the first time should run soon rather than after a full interval.
    const nextRunAt = enabled ? (host.schedule?.nextRunAt ?? new Date()) : null

    const schedule = await prisma.resyncSchedule.upsert({
      where: { apicHostId },
      create: {
        apicHostId,
        enabled,
        intervalMinutes,
        encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: actor.id,
      },
      update: {
        enabled,
        intervalMinutes,
        encUsername,
        encPassword,
        nextRunAt,
        updatedByUserId: actor.id,
      },
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync_schedule.update',
      target: `${host.name} (${host.host})`,
      detail: `${enabled ? 'enabled' : 'disabled'}, every ${intervalMinutes}m, runs as ${username}`,
    })

    return {
      success: true,
      data: toSafeSchedule({ id: host.id, name: host.name, host: host.host }, schedule),
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/** Queue an immediate run — the ticker picks it up within one tick. */
export async function runResyncScheduleNow(apicHostId: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const schedule = await prisma.resyncSchedule.findUnique({
      where: { apicHostId },
      include: { apicHost: true },
    })
    if (!schedule) return { success: false, error: 'No schedule for this host' }
    if (!schedule.enabled) return { success: false, error: 'Schedule is disabled' }
    if (schedule.runningAt) return { success: false, error: 'A run is already in progress' }

    await prisma.resyncSchedule.update({
      where: { apicHostId },
      data: { nextRunAt: new Date() },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync_schedule.update',
      target: `${schedule.apicHost.name} (${schedule.apicHost.host})`,
      detail: 'queued an immediate run',
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteResyncSchedule(apicHostId: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.resyncSchedule.findUnique({
      where: { apicHostId },
      include: { apicHost: true },
    })
    const result = await prisma.resyncSchedule.deleteMany({ where: { apicHostId } })
    if (result.count === 0) return { success: false, error: 'No schedule for this host' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'resync_schedule.delete',
      target: existing ? `${existing.apicHost.name} (${existing.apicHost.host})` : apicHostId,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 4: Run to verify the tests pass**

Run: `bun test src/actions/resync-schedules.test.ts && bunx tsc --noEmit && bun run lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/actions/resync-schedules.ts src/actions/resync-schedules.test.ts
git commit -m "feat: add resync schedule server actions"
```

---

### Task 8: Scheduler page and UI

**Files:**
- Create: `src/app/(app)/scheduler/page.tsx`
- Create: `src/app/(app)/scheduler/SchedulerClient.tsx`
- Modify: `src/components/AppSidebar.tsx` (add to the `Infrastructure` group of `ACI_NAV`, after the `/apic-hosts` entry)

**Interfaces:**
- Consumes: `getResyncSchedules`, `upsertResyncSchedule`, `runResyncScheduleNow`, `deleteResyncSchedule`, `SafeResyncSchedule` (Task 7)
- Produces: `/scheduler` route

- [ ] **Step 1: Write the server component**

Mirrors `src/app/(app)/apic-hosts/page.tsx` exactly.

```tsx
// src/app/(app)/scheduler/page.tsx
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getResyncSchedules } from '@/actions/resync-schedules'
import { SchedulerClient } from './SchedulerClient'

export const metadata: Metadata = {
  title: 'Scheduler',
  description: 'Automatic resync schedules per APIC controller.',
}

export default async function SchedulerPage() {
  const session = await getSession()
  if (!session) redirect('/signin')
  if (session.user.role !== 'admin') notFound()

  const schedules = await getResyncSchedules()

  return <SchedulerClient initialSchedules={schedules} />
}
```

- [ ] **Step 2: Write the client component**

```tsx
// src/app/(app)/scheduler/SchedulerClient.tsx
'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { IconClockPlay, IconPlayerPlay, IconTrash } from '@tabler/icons-react'
import {
  deleteResyncSchedule,
  runResyncScheduleNow,
  upsertResyncSchedule,
  type SafeResyncSchedule,
} from '@/actions/resync-schedules'
import { INPUT_CLS, LABEL_CLS, SELECT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'

const INTERVAL_PRESETS = [
  { label: 'every 15m', value: 15 },
  { label: 'every 30m', value: 30 },
  { label: 'every 1h', value: 60 },
  { label: 'every 4h', value: 240 },
  { label: 'every 8h', value: 480 },
  { label: 'every 24h', value: 1440 },
]

function intervalLabel(minutes: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.value === minutes)
  if (preset) return preset.label
  return `every ${minutes}m`
}

function relative(date: Date | null): string {
  if (!date) return '—'
  const deltaMs = new Date(date).getTime() - Date.now()
  const past = deltaMs < 0
  const mins = Math.round(Math.abs(deltaMs) / 60_000)
  const text = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`
  return past ? `${text} ago` : `in ${text}`
}

function statusBadge(schedule: SafeResyncSchedule) {
  if (schedule.isRunning) return <Badge variant="secondary">running…</Badge>
  if (!schedule.lastStatus) return <span className="text-faint">never run</span>
  const variant =
    schedule.lastStatus === 'success' ? 'default' : schedule.lastStatus === 'partial' ? 'secondary' : 'destructive'
  return <Badge variant={variant}>{schedule.lastStatus}</Badge>
}

export function SchedulerClient({ initialSchedules }: { initialSchedules: SafeResyncSchedule[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [editing, setEditing] = useState<SafeResyncSchedule | null>(null)
  const [isPending, startTransition] = useTransition()

  // Form state for the edit dialog
  const [enabled, setEnabled] = useState(false)
  const [intervalMinutes, setIntervalMinutes] = useState(480)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function openEditor(schedule: SafeResyncSchedule) {
    setEditing(schedule)
    setEnabled(schedule.enabled)
    setIntervalMinutes(schedule.intervalMinutes)
    setUsername(schedule.username === '(unreadable)' ? '' : schedule.username)
    setPassword('')
  }

  function replace(updated: SafeResyncSchedule) {
    setSchedules((prev) => prev.map((s) => (s.apicHostId === updated.apicHostId ? updated : s)))
  }

  function handleSave() {
    if (!editing) return
    startTransition(async () => {
      const result = await upsertResyncSchedule(editing.apicHostId, {
        enabled,
        intervalMinutes,
        username,
        password: password || undefined,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      replace(result.data)
      setEditing(null)
      toast.success('Schedule saved')
    })
  }

  function handleRunNow(schedule: SafeResyncSchedule) {
    startTransition(async () => {
      const result = await runResyncScheduleNow(schedule.apicHostId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success('Run queued — starts within a minute')
    })
  }

  function handleDelete(schedule: SafeResyncSchedule) {
    startTransition(async () => {
      const result = await deleteResyncSchedule(schedule.apicHostId)
      if (!result.success) {
        toast.error(result.error)
        return
      }
      replace({
        ...schedule,
        enabled: false,
        hasPassword: false,
        username: '',
        nextRunAt: null,
        lastRunAt: null,
        lastStatus: null,
        lastDetail: null,
        isRunning: false,
        isOverdue: false,
      })
      toast.success('Schedule removed')
    })
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Scheduler</h1>
            <p className="text-xs text-subtle mt-0.5">
              Automatic resyncs per controller. Intervals are measured from the end of the previous run.
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {schedules.length === 0 ? (
          <p className="text-sm text-subtle">
            No APIC hosts registered yet. Add one on the APIC Hosts page first.
          </p>
        ) : (
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4">Host</th>
                  <th className="py-2 pr-4">Enabled</th>
                  <th className="py-2 pr-4">Interval</th>
                  <th className="py-2 pr-4">Runs as</th>
                  <th className="py-2 pr-4">Last run</th>
                  <th className="py-2 pr-4">Next run</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.apicHostId} className="border-t border-border">
                    <td className="py-2.5 pr-4">
                      <div className="font-medium text-foreground">{s.hostName}</div>
                      <div className="text-xs text-faint">{s.host}</div>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Switch
                        checked={s.enabled}
                        disabled={isPending || !s.hasPassword}
                        onCheckedChange={(next) => {
                          startTransition(async () => {
                            const result = await upsertResyncSchedule(s.apicHostId, {
                              enabled: next,
                              intervalMinutes: s.intervalMinutes,
                              username: s.username,
                            })
                            if (!result.success) {
                              toast.error(result.error)
                              return
                            }
                            replace(result.data)
                          })
                        }}
                      />
                    </td>
                    <td className="py-2.5 pr-4 text-foreground">
                      {s.hasPassword ? `${intervalLabel(s.intervalMinutes)} after completion` : '—'}
                    </td>
                    <td className="py-2.5 pr-4 text-foreground">{s.username || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-2">
                        {statusBadge(s)}
                        <span className="text-xs text-faint">{relative(s.lastRunAt)}</span>
                      </div>
                      {s.lastDetail ? (
                        <div className="text-xs text-faint truncate max-w-[22rem]">{s.lastDetail}</div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4">
                      {s.enabled ? (
                        <span className={s.isOverdue ? 'text-destructive' : 'text-foreground'}>
                          {s.isOverdue ? 'overdue — is the ticker running?' : relative(s.nextRunAt)}
                        </span>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1.5 justify-end">
                        <Button size="sm" variant="ghost" disabled={isPending} onClick={() => openEditor(s)}>
                          <IconClockPlay size={15} stroke={1.75} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending || !s.enabled}
                          onClick={() => handleRunNow(s)}
                        >
                          <IconPlayerPlay size={15} stroke={1.75} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isPending || !s.hasPassword}
                          onClick={() => handleDelete(s)}
                        >
                          <IconTrash size={15} stroke={1.75} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.hostName} schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Interval</label>
              <select
                className={SELECT_CLS}
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              >
                {INTERVAL_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label} after completion
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>APIC username</label>
              <input className={INPUT_CLS} value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div>
              <label className={LABEL_CLS}>
                APIC password {editing?.hasPassword ? '(leave blank to keep the current one)' : ''}
              </label>
              <input
                className={INPUT_CLS}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Switch checked={enabled} onCheckedChange={setEnabled} />
              Enabled
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 3: Add the sidebar entry**

In `src/components/AppSidebar.tsx`, import `IconClockPlay` alongside the other `@tabler/icons-react` imports, then add this item to the `Infrastructure` group immediately after the `/apic-hosts` entry:

```tsx
      {
        href: "/scheduler",
        label: "Scheduler",
        icon: <IconClockPlay size={15} stroke={1.75} />,
        adminOnly: true,
      },
```

- [ ] **Step 4: Verify it builds and renders**

Run: `bunx tsc --noEmit && bun run lint && bun run build`
Expected: PASS, with `/scheduler` listed in the route output.

Then `bun run dev`, sign in as an admin, and confirm at `localhost:3000/scheduler`: every registered APIC host appears; the toggle is disabled until credentials are saved; saving credentials then enabling schedules a run; a non-admin gets a 404.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/scheduler" src/components/AppSidebar.tsx
git commit -m "feat: add scheduler admin page"
```

---

### Task 9: Ticker script and documentation

**Files:**
- Create: `scheduler/tick.sh`
- Modify: `README.md` (env table ~line 66; scheduler paragraph line 402; credentials claim line 404; route table ~line 464)
- Modify: `content/docs/admin/scheduled-resync.mdx`

**Interfaces:**
- Consumes: `/api/cron/tick` (Task 6)
- Produces: `scheduler/tick.sh`

- [ ] **Step 1: Write the ticker script**

```sh
#!/bin/sh
# Stateless scheduler ticker. Holds no schedule state — the app decides what is due.
set -eu

: "${TICK_URL:?TICK_URL is required}"
: "${SCHEDULER_TOKEN:?SCHEDULER_TOKEN is required}"

while true; do
  if ! curl -fsS --max-time 900 \
    -X POST "${TICK_URL}" \
    -H "Authorization: Bearer ${SCHEDULER_TOKEN}"; then
    echo "$(date -Iseconds) tick failed" >&2
  fi
  sleep "${TICK_INTERVAL_SECONDS:-60}"
done
```

Then `chmod +x scheduler/tick.sh`.

- [ ] **Step 2: Correct the security claim in `README.md`**

Replace the blockquote at line 404 — it is false once schedules exist:

```markdown
> **Credential storage.** Interactive resyncs from the UI never store the APIC
> username/password — they are used for that request only. **Scheduled** resyncs must run
> unattended, so a schedule stores its credentials encrypted (AES-256-GCM via
> `ENCRYPTION_KEY`) in the `resync_schedule` table. This protects leaked database dumps and
> backups; it does **not** protect against host compromise, since `ENCRYPTION_KEY` lives in
> `.env` on the same machine. Changing `ENCRYPTION_KEY` invalidates stored credentials and
> requires re-entering them.
```

- [ ] **Step 3: Update the rest of `README.md`**

- Env table (~line 66): change `ENCRYPTION_KEY` to **required**, noting it encrypts stored scheduler credentials.
- Scheduler paragraph (line 402): state that schedules are configured in-app on the **Scheduler** page, with `POST /api/cron/resync` retained for external schedulers.
- Route table (~line 464): add `| POST /api/cron/tick | Ticker entry point — runs any due schedules (Bearer SCHEDULER_TOKEN) |`.
- In the deployment section, document the compose service (noting it belongs with the `app` service from the Docker branch):

```yaml
  scheduler:
    image: curlimages/curl:8.11.0
    depends_on: [app]
    env_file: [.env]
    environment:
      TICK_URL: http://app:3000/api/cron/tick
      TICK_INTERVAL_SECONDS: 60
    volumes: ["./scheduler/tick.sh:/tick.sh:ro"]
    entrypoint: ["/bin/sh", "/tick.sh"]
    restart: unless-stopped
```

- [ ] **Step 4: Rewrite `content/docs/admin/scheduled-resync.mdx`**

Its opening line — *"Netroku ACI does not have a built-in scheduler"* — is now wrong. Restructure to:

1. **In-app scheduling (recommended)** — the Scheduler page, one schedule per host, interval measured from completion, credentials stored encrypted, "Run now" queues within a minute, the overdue badge meaning the ticker is not running.
2. **The ticker** — what `POST /api/cron/tick` is and the compose service that calls it.
3. **External scheduling (still supported)** — the existing `POST /api/cron/resync` docs, kept as-is for anyone driving it from outside.
4. **Migrating off a systemd timer** — `systemctl disable --now netroku-resync.timer`, then recreate the schedules in the UI. Warn that a unit with a second `ExecStart` (e.g. a legacy collector) must be stripped rather than deleted.

- [ ] **Step 5: Verify docs build**

Run: `bun run build`
Expected: PASS — fumadocs compiles the MDX, so a syntax error fails the build.

- [ ] **Step 6: Commit**

```bash
git add scheduler/tick.sh README.md content/docs/admin/scheduled-resync.mdx
git commit -m "docs: document in-app scheduler and add ticker script"
```

---

### Task 10: End-to-end verification

No new code — proves the feature actually works against a real APIC and DB before the branch is called done.

- [ ] **Step 1: Apply the migration to a running database**

Run: `bun run db:setup`
Expected: the `add_resync_schedule` migration applies cleanly.

- [ ] **Step 2: Create a schedule through the UI**

With `bun run dev`, sign in as admin, go to `/scheduler`, and for one real host set username/password, interval **15m**, and enable it. Confirm the row shows `in <1m` and the toggle sticks after a reload.

- [ ] **Step 3: Fire a tick manually and watch it run**

```bash
curl -s -X POST localhost:3000/api/cron/tick -H "Authorization: Bearer $SCHEDULER_TOKEN"
```

Expected: `{"ran":1,"results":[{"apicHostId":"…","host":"…","status":"success"}]}`. Reload `/scheduler`: `Last run` shows a success badge and `Next run` is ~15m out. Check `/history` for the four `resync.*` rows under `scheduler`.

- [ ] **Step 4: Verify the overlap guard**

Enable a second schedule, then run two ticks concurrently:

```bash
for i in 1 2; do
  curl -s -X POST localhost:3000/api/cron/tick -H "Authorization: Bearer $SCHEDULER_TOKEN" &
done; wait
```

Expected: each schedule runs at most once — the audit log must not contain duplicate `resync.endpoints` entries for the same host at the same timestamp.

- [ ] **Step 5: Verify credential-failure isolation**

Temporarily corrupt one row's ciphertext, then tick:

```bash
psql "$DATABASE_URL" -c "UPDATE resync_schedule SET \"encPassword\" = 'garbage' WHERE id = (SELECT id FROM resync_schedule LIMIT 1);"
curl -s -X POST localhost:3000/api/cron/tick -H "Authorization: Bearer $SCHEDULER_TOKEN"
```

Expected: that host shows `Credential decryption failed` as `lastDetail` with `lastStatus = failure`, `runningAt` is cleared, `nextRunAt` moved forward, **and the other schedule still ran**. Re-enter the password in the UI afterwards to repair it.

- [ ] **Step 6: Verify the ticker script**

```bash
TICK_URL=http://localhost:3000/api/cron/tick SCHEDULER_TOKEN=$SCHEDULER_TOKEN \
  TICK_INTERVAL_SECONDS=10 sh scheduler/tick.sh
```

Expected: a JSON response roughly every 10s, and no crash when the app is stopped and restarted mid-loop.

- [ ] **Step 7: Full check and commit any fixes**

Run: `bun test && bun run lint && bun run build`
Expected: PASS.

---

## Notes for the reviewer

- **`POST /api/cron/resync` is load-bearing during migration.** Task 4 is a pure refactor; if its request or response shape changed, the live systemd timer breaks. This is the highest-risk change in the plan.
- **`toSafeSchedule` is the security boundary.** Its leak test in Task 7 is not a formality — it is the guard against ciphertext or passwords reaching the browser.
- **Claiming one row per iteration is deliberate** (Task 5). Bulk-claiming plus sequential execution is unsafe: a row claimed but waiting behind earlier hosts can pass the stale window and be reclaimed by another tick, producing a double run.
- **No task mocks Prisma**, matching the existing suite. DB behavior is proven in Task 10 instead, which is why that task is not optional.
