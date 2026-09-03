# Health Scores Health Feature — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)

## Context

The monitoring side of the ACI Toolkit polls APIC on a schedule and stores
history in SQLite, reporting per data subject. Built so far: **Endpoints**,
**Interfaces**, **Faults** — each following the same collector pattern:

- a `resync*` lib function (APIC login → class query → chunked upsert of a
  *snapshot* model, plus per-resync *sample* rows for trends),
- an authed `POST /api/<subject>/resync` route,
- cron wiring in `/api/cron/resync`,
- a server-component page reading SQLite with filters/pagination,
- a sidebar entry and a dashboard tile.

This is the **second** of three planned monitoring slices (Health scores → Node
& hardware → fabric-overview dashboard). It gives the dashboard its headline
0–100 fabric-health number. It closely mirrors the Faults slice
(`src/lib/apic/faults.ts`, `src/app/(app)/faults/`,
`docs/superpowers/specs/2026-06-14-faults-health-feature-design.md`).

Primary job: **reporting / overview**.

## Goal

Collect, store, and report Cisco ACI **health scores** (0–100) — a headline
overall fabric score with an over-time trend, plus a worst-first breakdown of
per-node and per-tenant scores — driven by the existing manual and scheduled
resync flows, and surface a health summary tile on the dashboard. Read-only.

## Health score scopes

Collected from **three** APIC sources (decided: three-source query, not a single
broad `healthInst` query which would pull a score for every EPG/BD/contract):

| Source class | Query | Yields |
|---|---|---|
| `fabricHealthTotal` | `/api/node/class/fabricHealthTotal.json` | fabric total (`dn = topology/health`) + per-pod (`topology/pod-N/health`) |
| `topSystem` | `/api/node/class/topSystem.json?rsp-subtree-include=health` | per-node score (node's `healthInst` child) |
| `fvTenant` | `/api/node/class/fvTenant.json?rsp-subtree-include=health` | per-tenant score (tenant's `healthInst` child) |

`scope` is derived: `fabric` | `pod` | `node` | `tenant`.

## Data model (Prisma)

Mirrors `FaultSnapshot` + `FaultCountSample`.

### `HealthScoreSnapshot` — current score per scored object

| Field | Notes |
|---|---|
| `id` | cuid |
| `apicHostId` / `apicHost` | relation, `onDelete: Cascade` |
| `dn` | parent object DN (the `/health` RN stripped for fabricHealthTotal; the parent DN for topSystem/fvTenant) |
| `scope` | `fabric` \| `pod` \| `node` \| `tenant` |
| `name` | friendly label: "Fabric", "Pod N", node name/id, tenant name |
| `node` | node id when `scope=node`, else null |
| `score` | Int — `cur` (0–100) |
| `twScore` | Int? — time-weighted score (`twScore`) |
| `prevScore` | Int? — previous score (`prev`) |
| `maxSeverity` | String? — worst contributing fault severity (`maxSev`) |
| `present` | Bool default true — flipped false when the object is absent from a resync (decommissioned node / deleted tenant), like Faults' cleared detection |
| `firstSeenAt` | DateTime default now |
| `lastSeenAt` | DateTime default now |

Constraints: `@@unique([apicHostId, dn])`, `@@index([apicHostId])`,
`@@index([apicHostId, scope])`, `@@map("health_score_snapshot")`.

### `HealthScoreSample` — one row per resync (trend chart)

| Field | Notes |
|---|---|
| `id` | cuid |
| `apicHostId` / `apicHost` | relation, `onDelete: Cascade` |
| `sampledAt` | default now |
| `overall` | Int — fabric total score |
| `worstScore` | Int — min across node + tenant scores |
| `degradedCount` | Int — count of node+tenant objects with `score < DEGRADED_THRESHOLD` |

Index: `@@index([apicHostId, sampledAt])`, `@@map("health_score_sample")`.

### `ApicHost` addition

Add `lastHealthSyncAt DateTime?`, plus back-relations
`healthScores HealthScoreSnapshot[]` and `healthSamples HealthScoreSample[]`.

### Absent detection

Like Faults' cleared detection / `Endpoint.isActive`: objects returned this
resync → `present=true`, `lastSeenAt=now`. Objects previously `present=true` for
this host but absent now → `present=false`. The page filters `present=true` by
default.

## Collector — `src/lib/apic/health-scores.ts`

- `ParsedHealthRow` — `{ dn, scope, name, node, score, twScore, prevScore,
  maxSeverity }`.
- Three pure parse helpers (one per source) that derive `scope`/`name`/`node`
  from the DN and read the score:
  - `parseFabricHealthRows(imdata)` — `fabricHealthTotal`; `topology/health` →
    fabric, `topology/pod-N/health` → pod (`name = "Pod N"`).
  - `parseNodeHealthRows(imdata)` — `topSystem` MOs; `name` from `topSystem`
    `name`/`id`, `node` = node id, score from the child `healthInst.cur`.
  - `parseTenantHealthRows(imdata)` — `fvTenant` MOs; `name` = tenant name,
    score from the child `healthInst.cur`.
- `parseHealthRows({ fabric, node, tenant })` — runs the three and concatenates.
- `healthBand(score)` — `good | fair | poor` via constants
  `GOOD_MIN = 95`, `FAIR_MIN = 80` (≥95 good, 80–94 fair, <80 poor).
  `DEGRADED_THRESHOLD = 90` for `degradedCount`.
- `summarizeHealth(rows)` — pure: returns `{ overall, worstScore,
  degradedCount }` from the parsed rows (overall = fabric row's score, worst =
  min over node+tenant, degraded = count below threshold).
- `fetchHealthScoresFromApic(host, user, pwd)` — login once, three GETs, return
  `parseHealthRows(...)`.
- `resyncHealthScores(args)`: dedupe by `dn` → chunked upsert
  `HealthScoreSnapshot` → mark absent `present=false` → insert one
  `HealthScoreSample` from `summarizeHealth` → set `lastHealthSyncAt`. Returns
  `{ synced, total, overall }`.

All read-only: GET queries plus the `aaaLogin` auth POST only.

## API routes

### `POST /api/health-scores/resync` (session-authed)

Same shape as `src/app/api/faults/resync/route.ts`: 401/400/404/502, calls
`resyncHealthScores`, records audit `action: 'resync.health'`.

### Cron wiring — `/api/cron/resync`

Add a Health dataset block to the per-host loop (mirroring Faults), audit
`resync.health`, `userName: 'scheduler'`. Extend `HostResult` with
`healthScores?: DatasetResult` and add `r.healthScores` to the
`summarizeResults` dataset loop.

### Audit

Add `'resync.health'` to the `AuditAction` union in `src/lib/audit.ts` **and**
to the `ACTION_LABELS` map (`Record<AuditAction, string>`) in
`src/app/(app)/history/HistoryClient.tsx` (label: "Resync health"). The
`Record` is exhaustive, so both must change together.

## Page — `src/app/(app)/health-scores/`

### `page.tsx` (server component)

- Session guard → redirect `/signin`.
- `getApicHosts()`; read `searchParams`: `apic`, `query`, `scope`, `page`,
  `pageSize` (reuse the Faults page-size parsing).
- Query `HealthScoreSnapshot` where `apicHostId` matches, default
  `present = true`, optional `scope` filter (`node|tenant`) and `name`/`node`
  search; paginate; sort worst-first via `sortHealthRows`.
- Load the fabric + pod snapshots (scope in `fabric`/`pod`) for the headline.
- Load recent `HealthScoreSample` series for the trend.
- `lastSyncedAt` from `lastHealthSyncAt`.

### `HealthScoresClient.tsx`

- **Headline**: latest overall fabric score as a large `healthBand`-colored
  number; per-pod score cards beneath when present.
- **Trend chart**: overall score over time from `HealthScoreSample`, same
  recharts + shadcn chart approach as the Faults trend (hidden when empty).
- **Breakdown table**: scope filter (node/tenant), search, default worst-first.
  Columns: Scope, Name, Node, Score (band badge), Max severity, Last seen.
- Host selector + resync credential dialog → `POST /api/health-scores/resync`,
  then `router.refresh()`; inline error surfacing. Empty states for no host /
  no rows.

### Helpers (colocated, tested)

- `sort.ts` — `sortHealthRows`: ascending score (worst first), tie-break name
  natural order.

## Navigation + dashboard tile

- Sidebar entry in `AppSidebar.tsx`: `/health-scores`, label "Health Scores", a
  heartbeat-style Tabler icon, placed after Faults.
- Dashboard `HealthTile` (+ `getHealthSummary` server action in
  `src/actions/health-scores.ts`): latest overall fabric score (band-colored) +
  worst-node score, linking to `/health-scores`. Add to the dashboard tile grid
  next to the Faults tile.

## Testing (bun test, colocated `*.test.ts`, no network)

- `parseFabricHealthRows` / `parseNodeHealthRows` / `parseTenantHealthRows` —
  scope/name/node derivation, score extraction from the `healthInst` child,
  missing-field tolerance.
- `healthBand` — boundary values (95, 94, 80, 79).
- `summarizeHealth` — overall/worst/degradedCount from mixed rows.
- `sortHealthRows` — worst-first ordering + name tie-break.

Network/DB functions (`fetchHealthScoresFromApic`, `resyncHealthScores`) stay
thin; testable logic lives in pure functions, matching `faults.ts`.

## Error handling

- Resync route: 401 / 400 / 404 / 502 exactly like the faults route.
- APIC login failure or any of the three GETs non-200 → throw → 502 on the
  manual route, audit `failure` in cron.
- Page: empty state when no host selected; fetch errors surfaced inline.

## Scope / YAGNI (explicitly out for v1)

- ❌ Per-object trend drilldown (overall-trend only).
- ❌ Writing back to APIC.
- ❌ User-configurable thresholds (constants for now).
- ❌ Snapshot/sample retention/pruning (shared follow-up across subjects).

## Follow-on sub-projects (out of scope here)

1. **Node & hardware** — `fabricNode`/`topSystem` + `eqpt*` sensors.
2. **Fabric overview dashboard** — aggregate all monitoring subjects.
