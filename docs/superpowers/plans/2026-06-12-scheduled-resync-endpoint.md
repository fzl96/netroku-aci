# Scheduled `/api/cron/resync` Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a machine-callable `POST /api/cron/resync` endpoint that an external scheduler hits to pull fresh endpoint + interface data from APIC into the local DB across multiple hosts, with no login session.

**Architecture:** Extract the persistence logic from the two existing manual resync routes into shared `resyncEndpoints` / `resyncInterfaces` lib functions. The manual routes and the new cron route both call them. The cron route authenticates with a bearer token (`SCHEDULER_TOKEN`), accepts per-host credentials in the body, processes hosts sequentially with isolated failures, and returns an aggregated per-host/per-dataset result. Pure helpers (token check, result summarisation) live in a separate, unit-tested module.

**Tech Stack:** Next.js 16 route handlers, Prisma (SQLite), `bun:test`, Node `crypto`.

**Spec:** `docs/superpowers/specs/2026-06-12-scheduled-resync-endpoint-design.md`

---

## File Structure

**Create:**
- `src/lib/apic/cron-resync.ts` — pure helpers + shared types: `DatasetResult`, `HostResult`, `isAuthorized()`, `summarizeResults()`.
- `src/lib/apic/cron-resync.test.ts` — `bun:test` unit tests for the pure helpers.
- `src/app/api/cron/resync/route.ts` — the new bearer-auth POST route.

**Modify:**
- `src/lib/apic/endpoints.ts` — add `resyncEndpoints(...)` (persistence extracted from the manual route).
- `src/lib/apic/interfaces.ts` — add `resyncInterfaces(...)` (persistence extracted from the manual route).
- `src/app/api/endpoints/resync/route.ts` — call `resyncEndpoints`, keep session + audit.
- `src/app/api/interfaces/resync/route.ts` — call `resyncInterfaces`, keep session + audit.
- `.env.example` — document `SCHEDULER_TOKEN`.

**Testing convention:** This repo unit-tests pure functions only (`bun:test`), with no DB/route integration tests or Prisma mocking. We follow that: the pure helpers get tests; the DB-orchestration extractions are verified by `bunx tsc --noEmit` (no behaviour change) and the existing suite.

---

## Task 1: Extract `resyncEndpoints` into the endpoints lib

**Files:**
- Modify: `src/lib/apic/endpoints.ts` (append new function)
- Modify: `src/app/api/endpoints/resync/route.ts` (call it)

- [ ] **Step 1: Add `resyncEndpoints` to `src/lib/apic/endpoints.ts`**

Add these imports at the very top of the file (the file currently only imports `apicFetch`):

```typescript
import { prisma } from '@/lib/prisma'
```

Append at the end of `src/lib/apic/endpoints.ts` (after `fetchEndpointsFromApic`):

```typescript
const ENDPOINTS_CHUNK_SIZE = 100

export interface ResyncEndpointsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

/**
 * Fetch endpoints from APIC and persist them for one host.
 * Marks existing rows inactive, then upserts the freshly fetched set as active.
 * Returns the number of unique rows synced and the host's total row count.
 */
export async function resyncEndpoints(
  args: ResyncEndpointsArgs,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, host, username, password } = args

  const fetched = await fetchEndpointsFromApic(host, username, password)

  // Deduplicate by (mac, ip) — last occurrence wins for multi-path endpoints
  const deduped = new Map<string, (typeof fetched)[number]>()
  for (const row of fetched) {
    deduped.set(`${row.mac}|${row.ip}`, row)
  }
  const uniqueRows = Array.from(deduped.values())

  const now = new Date()

  // Mark all current active endpoints as inactive
  await prisma.endpoint.updateMany({
    where: { apicHostId, isActive: true },
    data: { isActive: false },
  })

  // Chunked transactional upsert
  for (let i = 0; i < uniqueRows.length; i += ENDPOINTS_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + ENDPOINTS_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(row =>
        prisma.endpoint.upsert({
          where: { apicHostId_mac_ip: { apicHostId, mac: row.mac, ip: row.ip } },
          update: {
            vlan: row.vlan,
            dn: row.dn,
            node: row.node,
            interface: row.interface,
            epgDescr: row.epgDescr,
            isActive: true,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            mac: row.mac,
            ip: row.ip,
            vlan: row.vlan,
            dn: row.dn,
            node: row.node,
            interface: row.interface,
            epgDescr: row.epgDescr,
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        }),
      ),
    )
  }

  const total = await prisma.endpoint.count({ where: { apicHostId } })

  return { synced: uniqueRows.length, total }
}
```

- [ ] **Step 2: Rewrite `src/app/api/endpoints/resync/route.ts` to call it**

Replace the entire file with:

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncEndpoints } from '@/lib/apic/endpoints'

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

  let result: { synced: number; total: number }
  try {
    result = await resyncEndpoints({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch endpoints from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.endpoints',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.synced} (total ${result.total})`,
  })

  return Response.json(result)
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the existing test suite (nothing should break)**

Run: `bun test`
Expected: PASS (same as before — no endpoint tests existed, refactor is behaviour-preserving).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/endpoints.ts src/app/api/endpoints/resync/route.ts
git commit -m "refactor: extract resyncEndpoints into endpoints lib"
```

---

## Task 2: Extract `resyncInterfaces` into the interfaces lib

**Files:**
- Modify: `src/lib/apic/interfaces.ts` (append new function)
- Modify: `src/app/api/interfaces/resync/route.ts` (call it)

- [ ] **Step 1: Add `resyncInterfaces` to `src/lib/apic/interfaces.ts`**

Ensure the file imports `prisma` (add at the top if not already present):

```typescript
import { prisma } from '@/lib/prisma'
```

Append at the end of `src/lib/apic/interfaces.ts` (after `fetchInterfacesFromApic`). This is the 3-phase persistence moved verbatim from the route:

```typescript
const INTERFACES_CHUNK_SIZE = 100

export interface ResyncInterfacesArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

/**
 * Fetch interface counters from APIC and persist them for one host.
 * Phase 1 upserts InterfaceSnapshot rows, phase 2 loads the latest prior sample
 * per interface, phase 3 inserts new samples with computed deltas.
 * Returns the number of unique interfaces synced and the host's total snapshot count.
 */
export async function resyncInterfaces(
  args: ResyncInterfacesArgs,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, host, username, password } = args

  const rows = await fetchInterfacesFromApic(host, username, password)

  // Deduplicate by DN — defensive, the class query shouldn't return dupes but be paranoid
  const deduped = new Map<string, (typeof rows)[number]>()
  for (const row of rows) deduped.set(row.dn, row)
  const uniqueRows = Array.from(deduped.values()).filter(r => r.dn)

  const now = new Date()

  // Phase 1: upsert all InterfaceSnapshot rows (chunked so a huge fabric doesn't trip SQLite)
  const snapshotIds = new Map<string, string>() // dn -> snapshot.id

  for (let i = 0; i < uniqueRows.length; i += INTERFACES_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + INTERFACES_CHUNK_SIZE)
    const upserted = await prisma.$transaction(
      chunk.map(row =>
        prisma.interfaceSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: row.dn } },
          update: {
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            lastSeenAt: now,
          },
          create: {
            apicHostId,
            dn: row.dn,
            node: row.node,
            ifName: row.ifName,
            usage: row.usage,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            description: row.description,
            lastLinkStChg: row.lastLinkStChg,
            firstSeenAt: now,
            lastSeenAt: now,
          },
          select: { id: true, dn: true },
        }),
      ),
    )
    for (const r of upserted) snapshotIds.set(r.dn, r.id)
  }

  // Phase 2: load the most recent sample for each interface in one go.
  const ids = Array.from(snapshotIds.values())
  const previousByInterface = new Map<string, {
    rxBytes: bigint; rxErrors: bigint; rxDiscards: bigint
    rxCrcErrors: bigint; rxAlignErrors: bigint
    txBytes: bigint; txErrors: bigint; txDiscards: bigint
  }>()

  if (ids.length > 0) {
    for (let i = 0; i < ids.length; i += 500) {
      const idChunk = ids.slice(i, i + 500)
      const previous = await prisma.interfaceSample.findMany({
        where: { interfaceId: { in: idChunk } },
        orderBy: { sampledAt: 'desc' },
        select: {
          interfaceId: true,
          rxBytes: true, rxErrors: true, rxDiscards: true,
          rxCrcErrors: true, rxAlignErrors: true,
          txBytes: true, txErrors: true, txDiscards: true,
        },
      })
      for (const row of previous) {
        if (previousByInterface.has(row.interfaceId)) continue
        previousByInterface.set(row.interfaceId, {
          rxBytes: row.rxBytes,
          rxErrors: row.rxErrors,
          rxDiscards: row.rxDiscards,
          rxCrcErrors: row.rxCrcErrors,
          rxAlignErrors: row.rxAlignErrors,
          txBytes: row.txBytes,
          txErrors: row.txErrors,
          txDiscards: row.txDiscards,
        })
      }
    }
  }

  // Phase 3: insert new samples (chunked).
  for (let i = 0; i < uniqueRows.length; i += INTERFACES_CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + INTERFACES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map((row) => {
        const interfaceId = snapshotIds.get(row.dn)!
        const prev = previousByInterface.get(interfaceId) ?? null

        return prisma.interfaceSample.create({
          data: {
            apicHostId,
            interfaceId,
            sampledAt: now,
            adminSt: row.adminSt,
            operSt: row.operSt,
            operSpeed: row.operSpeed,
            rxBytes: row.rxBytes,
            rxPkts: row.rxPkts,
            rxErrors: row.rxErrors,
            rxDiscards: row.rxDiscards,
            rxCrcErrors: row.rxCrcErrors,
            rxAlignErrors: row.rxAlignErrors,
            txBytes: row.txBytes,
            txPkts: row.txPkts,
            txErrors: row.txErrors,
            txDiscards: row.txDiscards,
            dRxBytes: computeDelta(row.rxBytes, prev?.rxBytes ?? null),
            dRxErrors: computeDelta(row.rxErrors, prev?.rxErrors ?? null),
            dRxDiscards: computeDelta(row.rxDiscards, prev?.rxDiscards ?? null),
            dRxCrcErrors: computeDelta(row.rxCrcErrors, prev?.rxCrcErrors ?? null),
            dRxAlignErrors: computeDelta(row.rxAlignErrors, prev?.rxAlignErrors ?? null),
            dTxBytes: computeDelta(row.txBytes, prev?.txBytes ?? null),
            dTxErrors: computeDelta(row.txErrors, prev?.txErrors ?? null),
            dTxDiscards: computeDelta(row.txDiscards, prev?.txDiscards ?? null),
          },
        })
      }),
    )
  }

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastInterfaceSyncAt: now },
  })

  const total = await prisma.interfaceSnapshot.count({ where: { apicHostId } })

  return { synced: uniqueRows.length, total }
}
```

- [ ] **Step 2: Rewrite `src/app/api/interfaces/resync/route.ts` to call it**

Replace the entire file with:

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncInterfaces } from '@/lib/apic/interfaces'

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

  let result: { synced: number; total: number }
  try {
    result = await resyncInterfaces({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch interfaces from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.interfaces',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.synced} (total ${result.total})`,
  })

  return Response.json(result)
}
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the existing test suite**

Run: `bun test`
Expected: PASS (the existing `interfaces.test.ts` for `computeDelta` / `parseInterfaceRows` still passes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/interfaces.ts src/app/api/interfaces/resync/route.ts
git commit -m "refactor: extract resyncInterfaces into interfaces lib"
```

---

## Task 3: Pure helpers for the cron route (TDD)

**Files:**
- Create: `src/lib/apic/cron-resync.ts`
- Test: `src/lib/apic/cron-resync.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/apic/cron-resync.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { isAuthorized, summarizeResults, type HostResult } from './cron-resync'

describe('isAuthorized', () => {
  const token = 'sekret-token-value'

  it('accepts a matching Bearer token', () => {
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true)
  })

  it('rejects a wrong token', () => {
    expect(isAuthorized('Bearer wrong', token)).toBe(false)
  })

  it('rejects a null header', () => {
    expect(isAuthorized(null, token)).toBe(false)
  })

  it('rejects a header without the Bearer prefix', () => {
    expect(isAuthorized(token, token)).toBe(false)
  })

  it('rejects a token of a different length without throwing', () => {
    expect(isAuthorized('Bearer short', token)).toBe(false)
  })
})

describe('summarizeResults', () => {
  const ok = { synced: 1, total: 1 }
  const bad = { error: 'boom' }

  it('returns failure for an empty result set', () => {
    expect(summarizeResults([])).toBe('failure')
  })

  it('returns success when every dataset succeeded', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: ok },
    ]
    expect(summarizeResults(results)).toBe('success')
  })

  it('returns failure when every dataset failed', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: bad, interfaces: bad },
    ]
    expect(summarizeResults(results)).toBe('failure')
  })

  it('returns partial when some datasets failed', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: bad },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })

  it('counts a host-level error as a failed unit', () => {
    const results: HostResult[] = [
      { apicHostId: 'a', host: 'a', endpoints: ok, interfaces: ok },
      { apicHostId: 'b', host: null, error: 'Host not found' },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: FAIL — `Cannot find module './cron-resync'`.

- [ ] **Step 3: Implement `src/lib/apic/cron-resync.ts`**

```typescript
import { timingSafeEqual } from 'crypto'

export type DatasetResult = { synced: number; total: number } | { error: string }

export interface HostResult {
  apicHostId: string | null
  host: string | null
  endpoints?: DatasetResult
  interfaces?: DatasetResult
  /** Set when the host entry failed before any dataset ran (bad input / host not found). */
  error?: string
}

/** Constant-time check of an `Authorization: Bearer <token>` header. */
export function isAuthorized(authHeader: string | null, expectedToken: string): boolean {
  if (!authHeader) return false
  const prefix = 'Bearer '
  if (!authHeader.startsWith(prefix)) return false
  const provided = Buffer.from(authHeader.slice(prefix.length))
  const expected = Buffer.from(expectedToken)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}

function datasetSucceeded(result: DatasetResult | undefined): boolean | null {
  if (!result) return null
  return !('error' in result)
}

/**
 * Reduce per-host results to an overall status.
 * Each dataset that ran, plus each host-level error, counts as one unit.
 * all-ok -> success, all-failed -> failure, mixed (or empty) -> partial/failure.
 */
export function summarizeResults(results: HostResult[]): 'success' | 'partial' | 'failure' {
  const units: boolean[] = []
  for (const r of results) {
    if (r.error) {
      units.push(false)
      continue
    }
    for (const d of [r.endpoints, r.interfaces]) {
      const ok = datasetSucceeded(d)
      if (ok !== null) units.push(ok)
    }
  }
  if (units.length === 0) return 'failure'
  const okCount = units.filter(Boolean).length
  if (okCount === units.length) return 'success'
  if (okCount === 0) return 'failure'
  return 'partial'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/cron-resync.ts src/lib/apic/cron-resync.test.ts
git commit -m "feat: add cron-resync auth and result-summary helpers"
```

---

## Task 4: The `/api/cron/resync` route

**Files:**
- Create: `src/app/api/cron/resync/route.ts`

- [ ] **Step 1: Implement the route**

Create `src/app/api/cron/resync/route.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncEndpoints } from '@/lib/apic/endpoints'
import { resyncInterfaces } from '@/lib/apic/interfaces'
import {
  isAuthorized,
  summarizeResults,
  type DatasetResult,
  type HostResult,
} from '@/lib/apic/cron-resync'

interface HostEntry {
  apicHostId?: string
  username?: string
  password?: string
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function POST(request: Request) {
  const token = process.env.SCHEDULER_TOKEN
  if (!token) {
    return Response.json({ error: 'Scheduler endpoint is not configured' }, { status: 503 })
  }
  if (!isAuthorized(request.headers.get('authorization'), token)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let hosts: HostEntry[]
  try {
    const body = (await request.json()) as { hosts?: HostEntry[] }
    hosts = body.hosts ?? []
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!Array.isArray(hosts) || hosts.length === 0) {
    return Response.json({ error: 'hosts must be a non-empty array' }, { status: 400 })
  }

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

    const trimmedUser = username.trim()
    const result: HostResult = { apicHostId, host: apicHost.name }

    // Endpoints
    let endpoints: DatasetResult
    try {
      endpoints = await resyncEndpoints({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      endpoints = { error: errorMessage(err, 'Failed to resync endpoints') }
    }
    result.endpoints = endpoints
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.endpoints',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in endpoints ? 'failure' : 'success',
      detail: 'error' in endpoints
        ? endpoints.error
        : `synced ${endpoints.synced} (total ${endpoints.total})`,
    })

    // Interfaces
    let interfaces: DatasetResult
    try {
      interfaces = await resyncInterfaces({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
    } catch (err) {
      interfaces = { error: errorMessage(err, 'Failed to resync interfaces') }
    }
    result.interfaces = interfaces
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.interfaces',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in interfaces ? 'failure' : 'success',
      detail: 'error' in interfaces
        ? interfaces.error
        : `synced ${interfaces.synced} (total ${interfaces.total})`,
    })

    results.push(result)
  }

  return Response.json({ status: summarizeResults(results), results })
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: no errors. (Confirms `HostResult`, `DatasetResult`, `resyncEndpoints`, `resyncInterfaces`, and `recordAudit`'s `status` field all line up.)

- [ ] **Step 3: Lint**

Run: `bun run lint`
Expected: no errors for the new files.

- [ ] **Step 4: Run the full test suite**

Run: `bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/cron/resync/route.ts
git commit -m "feat: add POST /api/cron/resync scheduled resync endpoint"
```

---

## Task 5: Document `SCHEDULER_TOKEN`

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local only — gitignored, not committed)

- [ ] **Step 1: Add the variable to `.env.example`**

Append to `.env.example`:

```
# Bearer token the external scheduler must send (Authorization: Bearer <token>)
# to call POST /api/cron/resync. Generate with: openssl rand -hex 32
SCHEDULER_TOKEN=
```

- [ ] **Step 2: Set a real value in local `.env`**

Generate and append to `.env` (this file is gitignored — do NOT commit it):

```bash
echo "SCHEDULER_TOKEN=$(openssl rand -hex 32)" >> .env
```

- [ ] **Step 3: Commit the example only**

```bash
git add .env.example
git commit -m "docs: document SCHEDULER_TOKEN env var"
```

---

## Task 6: Manual verification

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`

- [ ] **Step 2: Reject a missing token (expect 401)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/cron/resync \
  -H 'Content-Type: application/json' -d '{"hosts":[]}'
```
Expected: `401`.

- [ ] **Step 3: Reject an empty hosts array with a valid token (expect 400)**

Replace `<TOKEN>` with the value from `.env`:

```bash
curl -s -w "\n%{http_code}\n" -X POST http://localhost:3000/api/cron/resync \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{"hosts":[]}'
```
Expected: body `{"error":"hosts must be a non-empty array"}`, status `400`.

- [ ] **Step 4: Resync a real host (expect 200 + results)**

Get an `apicHostId` from the APIC Hosts page (or DB), then:

```bash
curl -s -X POST http://localhost:3000/api/cron/resync \
  -H 'Authorization: Bearer <TOKEN>' -H 'Content-Type: application/json' \
  -d '{"hosts":[{"apicHostId":"<ID>","username":"<APIC_USER>","password":"<APIC_PASS>"}]}' | jq
```
Expected: `status: "success"` with `endpoints` and `interfaces` each showing `{ synced, total }`. Confirm the Endpoints and Interface Health pages show refreshed data, and the History page shows two `scheduler` audit rows.

---

## Self-Review Notes

- **Spec coverage:** auth/fail-closed (Task 4 §503/401 + Task 3 `isAuthorized`), request shape & validation (Task 4), per-host sequential + isolated failures (Task 4 try/catch per dataset), audit as `scheduler` (Task 4), response shape & status derivation (Task 3 `summarizeResults` + Task 4), shared lib extraction with unchanged manual routes (Tasks 1–2), `SCHEDULER_TOKEN` env (Task 5), tests (Task 3) — all covered.
- **Type consistency:** `resyncEndpoints`/`resyncInterfaces` return `{ synced, total }`, which is assignable to `DatasetResult`; `HostResult` is shared from `cron-resync.ts`; `recordAudit` accepts `status` (`'success' | 'failure'`) and `userId: null` per its existing signature.
- **Convention:** DB-orchestration extractions verified via `tsc`/existing suite rather than Prisma-mock tests, matching this repo's pure-function-only test style.
