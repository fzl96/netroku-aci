# Faults Health Feature — Design

**Date:** 2026-06-14
**Status:** Approved (pre-implementation)

## Context

The monitoring side of the ACI Toolkit polls APIC on a schedule and stores
history in SQLite. It currently covers two data subjects:

- **Endpoints** — MAC/IP/VLAN learning per host (`Endpoint`, `isActive`)
- **Interfaces** — oper/admin state, speed, and time-series counters
  (`InterfaceSnapshot` + `InterfaceSample` with computed deltas)

Each follows the same pattern: a `resync*` lib function (APIC login → class
query → chunked upsert of a *snapshot* model, plus *sample* rows for trends),
an authed `POST /api/<subject>/resync` route, cron wiring in
`/api/cron/resync`, a server-component page reading SQLite with
filters/pagination, and a sidebar entry.

This is the **first** of three planned monitoring data sources (Faults, Health
scores, Node & hardware) that will feed a future fabric-overview dashboard.
Faults is sequenced first: it is the single most important ACI ops signal,
`faultInst` is cheap to query and aggregate, and building it de-risks the
shared pattern for the other two.

The `dashboard/` route is currently an "under construction" stub; this slice
adds the first real tile to it.

## Goal

Collect, store, and report Cisco ACI fabric **faults** — a sortable/filterable
fault table plus a severity-count trend chart — driven by the existing manual
and scheduled resync flows, and surface a faults summary tile on the dashboard.

Primary job: **reporting / overview** (a fabric-wide health snapshot).

## Data model (Prisma)

Mirrors `InterfaceSnapshot` + `InterfaceSample`.

### `FaultSnapshot` — one row per active fault instance

| Field | Notes |
|---|---|
| `id` | cuid |
| `apicHostId` / `apicHost` | relation, `onDelete: Cascade` |
| `dn` | the `faultInst` DN (e.g. `…/fault-F1394`) — stable identity |
| `code` | F-code, e.g. `F1394` |
| `severity` | `critical` \| `major` \| `minor` \| `warning` |
| `domain` | e.g. `infra`, `tenant`, `access` |
| `type` | `operational` \| `config` \| `environmental` \| `communications` |
| `cause` | APIC cause string |
| `affectedDn` | the fault DN with `/fault-…` stripped (the affected object) |
| `node` | parsed from `affectedDn` when it matches `topology/pod-x/node-y`, else null |
| `descr` | fault description |
| `ack` | bool (APIC `ack` `"yes"`/`"no"`) |
| `created` | APIC raised time (nullable) |
| `lastTransition` | APIC last transition time (nullable) |
| `lifecycle` | `active` \| `cleared` |
| `firstSeenAt` | first time **we** saw it (default now) |
| `lastSeenAt` | last time we saw it (default now) |
| `clearedAt` | set when flipped to `cleared` (nullable) |

Constraints: `@@unique([apicHostId, dn])`, `@@index([apicHostId])`.

### `FaultCountSample` — one row per resync (trend chart)

| Field | Notes |
|---|---|
| `id` | cuid |
| `apicHostId` / `apicHost` | relation, `onDelete: Cascade` |
| `sampledAt` | default now |
| `critical` / `major` / `minor` / `warning` | Int severity tallies |
| `total` | Int |

Index: `@@index([apicHostId, sampledAt])`.

### `ApicHost` addition

Add `lastFaultSyncAt DateTime?` (mirrors `lastInterfaceSyncAt`), plus the
back-relations `faults FaultSnapshot[]` and `faultCounts FaultCountSample[]`.

### Cleared detection

Like `Endpoint.isActive`. On each resync:

- Faults returned this resync → upsert with `lifecycle=active`,
  `lastSeenAt=now`, `clearedAt=null`.
- Faults previously `active` for this host but **absent** from the current
  result set → flip to `lifecycle=cleared`, set `clearedAt=now` (transition
  once; don't overwrite an existing `clearedAt`).

APIC drops cleared faults from `faultInst` (they move to `faultRecord`), so
absence from the live result set reliably means cleared.

## APIC fetch + parse — `src/lib/apic/faults.ts`

- `parseFaultRows(imdata)` — pure function: maps each `faultInst` MO to an
  `ApicFaultRow` (severity/ack mapping, `affectedDn`/`node` derivation,
  missing-field tolerance via defaults).
- `fetchFaultsFromApic(host, user, pwd)` — login →
  `GET /api/node/class/faultInst.json` → `parseFaultRows(data.imdata)`.
- `resyncFaults(args)`:
  1. fetch rows, dedupe by `dn`
  2. chunked upsert `FaultSnapshot` (active) in `prisma.$transaction` chunks
  3. mark previously-active faults absent from this set as `cleared`
  4. insert one `FaultCountSample` with severity tallies
  5. set `ApicHost.lastFaultSyncAt = now`
  6. return `{ synced, total, critical, major, minor }`

### Targeted reuse improvement

`fetchInterfacesFromApic` and `resyncEndpoints` each re-implement the
`aaaLogin` request and token extraction. Extract `apicLogin(host, user, pwd) →
token` into `client.ts` and have faults use it; optionally retrofit the other
two. This prevents a third copy of the login dance from landing.

## API routes

### `POST /api/faults/resync` (session-authed)

Same shape as `src/app/api/interfaces/resync/route.ts`:
- 401 if no session; 400 on invalid body / missing `apicHostId` /
  missing `username`/`password`; 404 if host not found; 502 on APIC failure.
- On success calls `resyncFaults`, records audit `action: 'resync.faults'`,
  returns the result.

### Cron wiring — `/api/cron/resync`

Add a third dataset block (Faults) to the per-host loop, mirroring the
Endpoints and Interfaces blocks, with its own audit line
(`action: 'resync.faults'`, `userName: 'scheduler'`). Extend `HostResult`
(in `src/lib/apic/cron-resync.ts`) with `faults?: DatasetResult`.
`summarizeResults` keys off `error` presence only, so it needs no change.

## Page — `src/app/(app)/faults/`

### `page.tsx` (server component)

- Session guard → redirect `/signin` if absent.
- `getApicHosts()`; read `searchParams`: `apic`, `query`, `severity`, `node`,
  `page`, `pageSize` (reuse the Interfaces page-size parsing convention).
- Query `FaultSnapshot` where `apicHostId` matches, default
  `lifecycle = 'active'`, with severity filter, node filter (comma list), and
  search across `code` / `descr` / `affectedDn`. Paginate like Interfaces.
- Load recent `FaultCountSample` series for the trend.
- `lastSyncedAt` from `ApicHost.lastFaultSyncAt`.
- Empty state when no host is selected / invalid `apic` param.

### `FaultsClient.tsx`

- A small **severity-count trend chart** at the top (same charting lib as the
  interface error-trend drawer).
- A **severity filter** and a sortable/filterable/paginated **table**:
  severity badge, code, affected DN/node, domain, description, created, ack.
- A host-scoped **Resync** button calling `POST /api/faults/resync`,
  mirroring the existing resync UI; surface fetch errors inline like the
  trend drawer.

### Helpers (colocated, with tests)

- `sort.ts` — severity ordering `critical > major > minor > warning`.
- A count-tally / trend-series helper for `FaultCountSample`.

## Navigation

Add a sidebar entry in `AppSidebar.tsx` under the monitoring group: `href:
'/faults'`, `label: 'Faults'`, `icon: IconAlertTriangle`, placed right after
the **Interfaces** entry.

## Dashboard tile

Add one **Faults tile** to the `dashboard/` stub: critical/major/minor counts
plus a sparkline from `FaultCountSample`, linking to `/faults`. First real
content on the under-construction dashboard; keep minimal for v1.

## Testing (bun test, colocated `*.test.ts`, no network)

- `parseFaultRows` — severity/ack mapping, `affectedDn`/`node` derivation,
  missing-field tolerance.
- cleared-detection — pure function over (previous active set, current set).
- count-tally helper.
- `sort.ts` severity ordering.

Network-dependent functions (`fetchFaultsFromApic`, `resyncFaults`) are kept
thin so the testable logic lives in pure parse/transform functions, matching
`interfaces.test.ts`.

## Error handling

- Resync route: 401 / 400 / 404 / 502 exactly like the interfaces route.
- APIC login failure or non-200 throws → surfaced as 502 on the manual route,
  and as an audit `failure` row in cron.
- Page: empty state when no host selected; fetch errors surfaced inline.

## Scope / YAGNI (explicitly out for v1)

- ❌ Acking/clearing faults back to APIC (read-only reporting only).
- ❌ Per-fault drilldown drawer (deferred; straightforward to add later).
- ❌ `FaultCountSample` / `FaultSnapshot` retention/pruning (interfaces don't
  prune either; tracked as a shared follow-up across monitoring subjects).

## Follow-on sub-projects (out of scope here)

1. **Health scores** — `healthInst` collector → headline fabric-health number.
2. **Node & hardware** — `fabricNode`/`topSystem` + `eqpt*` sensors.
3. **Fabric overview dashboard** — aggregate all monitoring subjects.
