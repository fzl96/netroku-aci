# Node & Hardware Health Feature — Design

**Date:** 2026-06-15
**Status:** Approved (pre-implementation)

## Context

The monitoring side of the ACI Toolkit polls APIC on a schedule and stores
history in SQLite, reporting per data subject. Built so far: **Endpoints**,
**Interfaces**, **Faults**, **Health Scores** — each following the same
collector pattern (a `resync*` lib → APIC login → class query → chunked upsert
of a _snapshot_ model + per-resync _sample_ rows; an authed
`POST /api/<subject>/resync` route; cron wiring; a server-component page; a
sidebar entry; a dashboard tile).

This is the **third** of the planned monitoring slices (Health Scores done; this
is Node & Hardware; the fabric-overview dashboard remains). It mirrors the
Faults/Health Scores slices (`src/lib/apic/faults.ts`,
`src/lib/apic/health-scores.ts`, `src/app/(app)/faults/`,
`src/app/(app)/health-scores/`).

Primary job: **reporting / overview** — "is the iron healthy."

Decisions made during brainstorming:

- Hardware depth: **Nodes + PSU + Fan** (temperature sensors deferred — their
  ACI classes vary by hardware and add parsing risk).
- **Light trend**: one sample per resync (nodes-online + failed-component
  counts); snapshot tables are the primary view.
- Route/module name: **`/nodes`** + `src/lib/apic/nodes.ts`.
- "Online" defined as `fabricNode.fabricSt === 'active'`.
- Single page with a **Nodes / Components view toggle** (not two pages).

## Goal

Collect, store, and report Cisco ACI fabric **node inventory + hardware
(PSU/fan) health** — node up/down, role, software version, uptime, and per-node
power-supply and fan status — driven by the existing manual and scheduled
resync flows, with a headline + light trend and a dashboard tile. Read-only.

## Data sources (one login, four GETs)

| Class        | Query                             | Yields                                                                                                                                            |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fabricNode` | `/api/node/class/fabricNode.json` | node identity: `id`, `name`, `role` (leaf/spine/controller), `model`, `serial`/`ser`, `fabricSt` (registration state), dn `topology/pod-N/node-M` |
| `topSystem`  | `/api/node/class/topSystem.json`  | operational: `state`, `version`, `systemUpTime`, `oobMgmtAddr`, `podId` — joined to nodes by node id                                              |
| `eqptPsu`    | `/api/node/class/eqptPsu.json`    | power supplies: `operSt`, `model`, `ser`, `id`; node parsed from dn                                                                               |
| `eqptFan`    | `/api/node/class/eqptFan.json`    | fans: `operSt`, `model`, `id`; node parsed from dn                                                                                                |

## Data model (Prisma)

### `NodeSnapshot` — one row per node

Upsert by `(apicHostId, dn)`.

| Field                        | Notes                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| `id`                         | cuid                                                                |
| `apicHostId` / `apicHost`    | relation, `onDelete: Cascade`                                       |
| `dn`                         | `fabricNode` dn (`topology/pod-N/node-M`)                           |
| `nodeId`                     | node id (e.g. `101`), parsed from dn                                |
| `name`                       | node name                                                           |
| `role`                       | `leaf` \| `spine` \| `controller` (`role` attr)                     |
| `model`                      | hardware model                                                      |
| `serial`                     | serial (`ser`)                                                      |
| `version`                    | software version (from `topSystem`, nullable)                       |
| `fabricSt`                   | registration state (`active`, `inactive`, `disabled`, ...)          |
| `state`                      | operational state from `topSystem` (e.g. `in-service`), nullable    |
| `podId`                      | pod id (from `topSystem` or parsed dn)                              |
| `uptime`                     | `systemUpTime` string from `topSystem`, nullable                    |
| `oobMgmtAddr`                | OOB mgmt address from `topSystem`, nullable                         |
| `present`                    | Bool default true (flipped false when absent — decommissioned node) |
| `firstSeenAt` / `lastSeenAt` | DateTime default now                                                |

Constraints: `@@unique([apicHostId, dn])`, `@@index([apicHostId])`,
`@@index([apicHostId, role])`, `@@map("node_snapshot")`.

### `HardwareComponent` — one row per PSU/fan

Upsert by `(apicHostId, dn)`.

| Field                        | Notes                                         |
| ---------------------------- | --------------------------------------------- |
| `id`                         | cuid                                          |
| `apicHostId` / `apicHost`    | relation, `onDelete: Cascade`                 |
| `dn`                         | component dn                                  |
| `nodeId`                     | owning node id, parsed from dn                |
| `type`                       | `psu` \| `fan`                                |
| `name`                       | component id/slot (`id` attr)                 |
| `operSt`                     | operational status string                     |
| `model`                      | model, nullable-as-empty                      |
| `serial`                     | serial (`ser`), nullable-as-empty             |
| `present`                    | Bool default true (flipped false when absent) |
| `firstSeenAt` / `lastSeenAt` | DateTime default now                          |

Constraints: `@@unique([apicHostId, dn])`, `@@index([apicHostId, nodeId])`,
`@@index([apicHostId, type])`, `@@map("hardware_component")`.

### `NodeStatusSample` — one row per resync (trend)

`sampledAt`, `nodesTotal`, `nodesOnline`, `componentsTotal`,
`componentsFailed`. `@@index([apicHostId, sampledAt])`,
`@@map("node_status_sample")`.

### `ApicHost` addition

Add `lastNodeSyncAt DateTime?`, plus back-relations `nodes NodeSnapshot[]`,
`hardware HardwareComponent[]`, `nodeSamples NodeStatusSample[]`.

### Absent detection

Like prior slices: objects returned this resync → `present=true`,
`lastSeenAt=now`; previously-present objects absent now → `present=false`.
Applied independently to `NodeSnapshot` and `HardwareComponent`. Pages filter
`present=true` by default.

## Collector — `src/lib/apic/nodes.ts`

Pure, tested helpers:

- `NodeRow` — `{ dn, nodeId, name, role, model, serial, version, fabricSt,
state, podId, uptime, oobMgmtAddr }`.
- `ComponentRow` — `{ dn, nodeId, type, name, operSt, model, serial }`.
- `parseFabricNodeRows(imdata)` — base node rows from `fabricNode` (node id
  parsed from dn via `topology/pod-(\d+)/node-(\d+)`).
- `parseTopSystemRows(imdata)` — `Map<nodeId, { version, state, uptime,
oobMgmtAddr, podId }>`.
- `mergeNodes(fabricNodes, topSystemByNode)` — `NodeRow[]` (left-join on nodeId;
  topSystem fields null when absent).
- `parsePsuRows(imdata)` / `parseFanRows(imdata)` — `ComponentRow[]`.
- `isNodeOnline(node)` — `node.fabricSt === 'active'`.
- `isComponentHealthy(type, operSt)` — PSU good = `on`/`ok`; fan good =
  `ok`/`on` (case-insensitive); else failed.
- `summarizeNodes(nodes, components)` — `{ nodesTotal, nodesOnline,
componentsTotal, componentsFailed }`.
- `fetchNodesFromApic(host, user, pwd)` — login once, 4 GETs, return
  `{ nodes: NodeRow[], components: ComponentRow[] }`.
- `resyncNodes(args)`: dedupe by dn → chunked upsert `NodeSnapshot` →
  present-detection for nodes → chunked upsert `HardwareComponent` →
  present-detection for components → insert one `NodeStatusSample` from
  `summarizeNodes` → set `lastNodeSyncAt`. Returns `{ syncedNodes,
syncedComponents, nodesOnline }`.

All read-only: GET queries plus the `aaaLogin` auth POST only.

## API routes

### `POST /api/nodes/resync` (session-authed)

Same shape as the faults/health route: 401/400/404/502, calls `resyncNodes`,
records audit `action: 'resync.nodes'`, detail
`synced ${syncedNodes} nodes, ${syncedComponents} components`.

### Cron wiring — `/api/cron/resync`

Add a Nodes dataset block to the per-host loop, audit `resync.nodes`,
`userName: 'scheduler'`. Extend `HostResult` with `nodes?: DatasetResult` and
add `r.nodes` to the `summarizeResults` dataset loop. Because `resyncNodes`
returns `{ syncedNodes, syncedComponents, nodesOnline }` (no `synced`/`total`),
the cron block builds the `DatasetResult` explicitly:
`{ synced: result.syncedNodes, total: result.syncedNodes + result.syncedComponents }`.

### Audit

Add `'resync.nodes'` to the `AuditAction` union in `src/lib/audit.ts` **and** to
the exhaustive `ACTION_LABELS` map in
`src/app/(app)/history/HistoryClient.tsx` (label: "Resync nodes").

## Page — `src/app/(app)/nodes/`

### `page.tsx` (server component)

- Session guard → redirect `/signin`.
- `getApicHosts()`; read `searchParams`: `apic`, `query`, `view`
  (`nodes`|`components`, default `nodes`), `role` (node view filter),
  `type` (component view filter `psu`|`fan`), `page`, `pageSize`.
- **Nodes view**: query `NodeSnapshot` where `apicHostId`, `present=true`,
  optional `role` filter, `name`/`nodeId` search; paginate; for each node load
  its PSU/fan ok-vs-total counts (group `HardwareComponent` by node+type and
  classify with `isComponentHealthy`). Sort by `nodeId` natural ascending.
- **Components view**: query `HardwareComponent` where `apicHostId`,
  `present=true`, optional `type` filter, `name`/`nodeId` search; paginate;
  sort failed-first then nodeId.
- Headline: nodes online / total, failed-component count (from latest snapshot
  state). Trend: recent `NodeStatusSample` series. `lastSyncedAt` from
  `lastNodeSyncAt`.

### `NodesClient.tsx`

- **Headline**: nodes online / total (large) + failed-component count
  (red when > 0).
- **Trend chart**: two lines — `nodesOnline` and `componentsFailed` over the
  sample series; same recharts + shadcn approach as the other slices; hidden
  when empty.
- **View toggle** (Nodes / Components) via the `view` URL param.
  - Nodes table: Node id, Name, Role, Model, Version, State (badge from
    `fabricSt`/`state`), Uptime, PSU `ok/total`, Fan `ok/total` (counts red when
    any failed).
  - Components table: Node, Type, Name, Status (operSt badge, red when failed),
    Model. Default failed-first.
- Role filter (nodes view) / type filter (components view), search, page-size,
  pagination, last-synced, host selector + resync credential dialog →
  `POST /api/nodes/resync` then `router.refresh()`. Empty states.

### Helpers (colocated, tested)

- `sort.ts` — `sortNodeRows` (nodeId natural ascending) and
  `sortComponentRows` (failed-first via a passed `healthy` flag, then nodeId).

## Navigation + dashboard tile

- Sidebar entry in `AppSidebar.tsx`: `/nodes`, label "Nodes", a server/cpu
  Tabler icon (verify the exact export exists, e.g. `IconServer2` or `IconCpu`),
  placed after Health Scores.
- Dashboard `NodesTile` (+ `getNodeSummary` server action in
  `src/actions/nodes.ts`): nodes online/total + failed-component count across
  hosts, linking to `/nodes`. Added to the dashboard tile grid.

## Testing (bun test, colocated `*.test.ts`, no network)

- `parseFabricNodeRows` — id/role/model/serial + nodeId derivation.
- `parseTopSystemRows` — map keyed by nodeId; version/state/uptime extraction.
- `mergeNodes` — join behavior, null topSystem fields when absent.
- `parsePsuRows` / `parseFanRows` — type + nodeId derivation, operSt.
- `isNodeOnline` — active vs inactive.
- `isComponentHealthy` — PSU/fan good/bad operSt values, case-insensitive.
- `summarizeNodes` — counts from mixed nodes/components.
- `sortNodeRows` / `sortComponentRows` — ordering.

Network/DB functions (`fetchNodesFromApic`, `resyncNodes`) stay thin; testable
logic lives in pure functions, matching `faults.ts` / `health-scores.ts`.

## Error handling

- Resync route: 401 / 400 / 404 / 502 exactly like the faults/health route.
- APIC login failure or any of the four GETs non-200 → throw → 502 on the
  manual route, audit `failure` in cron.
- Page: empty state when no host selected; fetch errors surfaced inline.

## Scope / YAGNI (explicitly out for v1)

- ❌ Temperature sensors (deferred — messy/variable ACI classes).
- ❌ Per-node detail drawer.
- ❌ Writing back to APIC.
- ❌ Configurable health thresholds.
- ❌ Snapshot/sample retention/pruning (shared follow-up across subjects).

## Follow-on sub-projects (out of scope here)

1. **Fabric overview dashboard** — aggregate all monitoring subjects (Faults,
   Health Scores, Nodes, plus Endpoints/Interfaces) into the `dashboard/` page.
2. (Later) **Temperature sensors** as an extension of this slice.
