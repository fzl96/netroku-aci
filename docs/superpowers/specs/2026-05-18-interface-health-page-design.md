# Interface Health Page — Design

## Context

The app already tracks **endpoints** per APIC host (resync button → `POST /api/endpoints/resync` → upsert into `Endpoint` table). We want a sibling capability for **interface health**: pull operational status and error/utilisation counters for every physical interface on each APIC host, store them durably, and surface a page that can answer:

- "What is each interface's current status, CRC, error, and utilisation picture?"
- "What did those counters look like at any prior point in time?"
- "Export interface health between dates X and Y."

The "every 8 hours, 3× per day" cadence is the target operating rhythm, but **the MVP is button-only resync** — automated scheduling is a follow-up feature. Designing the data model now so it supports the eventual scheduled cadence without rework.

## Scope

**In scope:**

- Add `InterfaceSnapshot` (latest state per interface) and `InterfaceSample` (append-only history) tables.
- Add `POST /api/interfaces/resync` route, parallel to the existing endpoints resync.
- Add APIC fetch function `fetchInterfacesFromApic(host, username, password)`.
- Add an interface health page that lists interfaces for a selected APIC host with a "Resync now" button.
- Date-ranged CSV export, matching the endpoint export pattern.

**Out of scope (future work):**

- Automated scheduling (cron / systemd timer / API-key auth path).
- Retention / pruning (we keep history forever for now — re-evaluate when DB size becomes a problem).
- Sparkline / chart rendering on the page (the data shape supports it; the visual implementation can ship in a follow-up).
- Alerting / thresholds.

## Data Model

Two new Prisma models. Append to `prisma/schema.prisma`.

```prisma
model InterfaceSnapshot {
  id            String   @id @default(cuid())
  apicHostId    String
  apicHost      ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn            String   // e.g. "topology/pod-1/node-101/sys/phys-[eth1/1]"
  node          String   // "101"
  ifName        String   // "eth1/1"
  usage         String   // l1PhysIf.usage verbatim: "epg" | "infra" | "discovery" | ""
  adminSt       String   // "up" | "down"
  operSt        String   // "up" | "down" | "linkLoopback" | ...
  operSpeed     String   // "10G" | "25G" | ...
  description   String   // l1PhysIf.descr
  lastLinkStChg DateTime?
  firstSeenAt   DateTime @default(now())
  lastSeenAt    DateTime @default(now())

  samples       InterfaceSample[]

  @@unique([apicHostId, dn])
  @@index([apicHostId])
  @@map("interface_snapshot")
}

model InterfaceSample {
  id            String            @id @default(cuid())
  apicHostId    String            // denormalised for fast date-range exports
  interfaceId   String
  interface     InterfaceSnapshot @relation(fields: [interfaceId], references: [id], onDelete: Cascade)
  sampledAt     DateTime

  // operational state at sample time
  adminSt       String
  operSt        String
  operSpeed     String

  // raw cumulative counters (BigInt — 32-bit wraps fast on 100G links)
  rxBytes        BigInt
  rxPkts         BigInt
  rxErrors       BigInt   // rmonIfIn.inErrors
  rxDiscards     BigInt   // rmonIfIn.inDiscards
  rxCrcErrors    BigInt   // rmonDot3Stats.fCSErrors
  rxAlignErrors  BigInt   // rmonEtherStats.alignmentErrors

  txBytes        BigInt
  txPkts         BigInt
  txErrors       BigInt
  txDiscards     BigInt

  // deltas vs the previous sample for THIS interface
  // null on first sample OR when current < previous (counter reset / reboot)
  dRxBytes       BigInt?
  dRxErrors      BigInt?
  dRxDiscards    BigInt?
  dRxCrcErrors   BigInt?
  dRxAlignErrors BigInt?
  dTxBytes       BigInt?
  dTxErrors      BigInt?
  dTxDiscards    BigInt?

  @@index([interfaceId, sampledAt])
  @@index([apicHostId, sampledAt])
  @@map("interface_sample")
}
```

Add a column to `ApicHost`:

```prisma
lastInterfaceSyncAt DateTime?
```

### Why two tables

- `InterfaceSnapshot` is the "what does this interface look like right now" projection. The list page renders from this with one index scan. It also gives us a stable FK target so samples never orphan if an interface disappears from the fabric (cascade deletes the history with it).
- `InterfaceSample` is the immutable historical record. Time-range queries (`sampledAt BETWEEN ?`) hit a covering index. Exports are a single `SELECT` with a `WHERE`.

### Why raw + delta together

APIC's RMON counters are cumulative since switch boot. Raw is the source of truth — it never lies and can always be re-derived. But every meaningful UI query wants the delta (`SUM(dRxErrors) WHERE sampledAt BETWEEN ?`). Storing both at ingest time keeps queries trivial without losing the source of truth. Extra storage cost is ~8 BigInt columns per row — negligible.

On counter reset (`current_raw < previous_raw`), we write `null` for the delta rather than guessing. The UI renders these as `—` or `(reset)`.

### Why we don't invent a `role` field

APIC already classifies via `l1PhysIf.usage` (`epg` / `infra` / `discovery` / `""`). Storing it verbatim avoids derived-field drift, requires no code change if APIC adds new values, and lets the UI filter on the actual APIC vocabulary. Default filter chip on the page: `usage = epg`.

## APIC Fetch Strategy

Single round-trip per host:

```
GET /api/node/class/l1PhysIf.json
    ?rsp-subtree=full
    &rsp-subtree-class=ethpmPhysIf,rmonIfIn,rmonIfOut,rmonDot3Stats,rmonEtherStats
```

Each returned `l1PhysIf` carries its children inline. Parsing pattern (sibling of `src/lib/apic/endpoints.ts`):

```ts
// src/lib/apic/interfaces.ts
export interface ApicInterfaceRow {
  dn: string; node: string; ifName: string;
  usage: string; adminSt: string; operSt: string; operSpeed: string;
  description: string; lastLinkStChg: Date | null;
  rxBytes: bigint; rxPkts: bigint; rxErrors: bigint; rxDiscards: bigint;
  rxCrcErrors: bigint; rxAlignErrors: bigint;
  txBytes: bigint; txPkts: bigint; txErrors: bigint; txDiscards: bigint;
}

export async function fetchInterfacesFromApic(
  host: string, username: string, plaintextPassword: string,
): Promise<ApicInterfaceRow[]> { /* ... */ }
```

Reuse `apicFetch` from `src/lib/apic/client.ts` and the same `aaaLogin` flow used by the endpoints fetcher.

Parse a DN like `topology/pod-1/node-101/sys/phys-[eth1/1]` with a regex into `{ node: "101", ifName: "eth1/1" }`, similar to the existing `FABRIC_PATH_RE` in `endpoints.ts`.

## Resync Semantics

`POST /api/interfaces/resync` shape mirrors `src/app/api/endpoints/resync/route.ts`:

1. Auth via session (`auth.api.getSession`).
2. Validate `apicHostId` belongs to current user.
3. Decrypt stored APIC password.
4. `fetchInterfacesFromApic(...)` — one HTTP call.
5. For each interface row:
   - Upsert into `InterfaceSnapshot` keyed on `(apicHostId, dn)`. Update status fields. Set `lastSeenAt = now`.
   - Look up the most recent `InterfaceSample` for this `interfaceId`. Compute deltas; null any delta where `current < previous`.
   - Insert a new `InterfaceSample` row with `sampledAt = now`, the raw counters, and the computed deltas.
6. Chunk samples into `prisma.$transaction` batches of 100 (same `CHUNK_SIZE` pattern as the endpoints resync).
7. Update `apicHost.lastInterfaceSyncAt = now`.
8. Respond `{ synced, total }`.

**Note we do _not_ mark old snapshots inactive** the way endpoint resync does. An interface that vanishes from the fabric is a rare and meaningful event; treating it as a soft-delete via an `isActive` flag would conflate "removed" with "down". Instead, leave the snapshot row in place but stop appending samples to it. Cleanup of truly-gone interfaces can be a follow-up if it becomes a problem.

## Page & UI

New route: `src/app/(app)/interface-health/page.tsx` plus an `InterfaceHealthClient.tsx` similar in shape to `src/app/(app)/endpoints/EndpointsClient.tsx`.

- APIC host selector (reuse the existing pattern).
- "Resync now" button → `POST /api/interfaces/resync`.
- Table of `InterfaceSnapshot` rows for the selected host:
  - Columns: node, ifName, usage, adminSt, operSt, operSpeed, description, lastLinkStChg, plus the latest sample's `dRxErrors / dTxErrors / dRxCrcErrors / dRxAlignErrors / dRxBytes / dTxBytes` (deltas from the most recent sync).
  - Default filter: `usage = epg`. Filter chips for `usage`, `node`, `operSt`.
  - Search box matching `ifName`, `node`, `description`, `dn`.
- "Last synced" label sourced from `apicHost.lastInterfaceSyncAt`.
- Sidebar nav entry alongside Endpoints.

### Export

`POST /api/interfaces/export` (or `GET` with query params), shape modelled on `src/app/api/endpoints/export/route.ts`:

- Body: `{ apicHostId, from?: ISO, to?: ISO, columns?: string[] }`. `from`/`to` are both optional — if missing, the corresponding bound is dropped (no lower / no upper).
- Query: `InterfaceSample WHERE apicHostId = ?` plus optional `sampledAt >= from` / `sampledAt <= to`, joined to `InterfaceSnapshot` for node/ifName.
- Return CSV in a `Response`, following the same pattern as `src/app/api/endpoints/export/route.ts`. Default columns: timestamp, node, ifName, usage, operSt, adminSt, rxErrors, txErrors, rxCrcErrors, rxAlignErrors, dRxBytes, dTxBytes.

## Files Touched

| Path                                                               | Change                                                                               |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                             | Add `InterfaceSnapshot`, `InterfaceSample`. Add `lastInterfaceSyncAt` to `ApicHost`. |
| `prisma/migrations/<new>/migration.sql`                            | Generated migration.                                                                 |
| `src/lib/apic/interfaces.ts` _(new)_                               | `fetchInterfacesFromApic` + types + DN parser.                                       |
| `src/app/api/interfaces/resync/route.ts` _(new)_                   | Resync route.                                                                        |
| `src/app/api/interfaces/export/route.ts` _(new)_                   | CSV export route.                                                                    |
| `src/app/(app)/interface-health/page.tsx` _(new)_                  | Page entry.                                                                          |
| `src/app/(app)/interface-health/InterfaceHealthClient.tsx` _(new)_ | Client component.                                                                    |
| `src/components/AppSidebar.tsx`                                    | Add nav entry.                                                                       |

Reuse: `apicFetch` (`src/lib/apic/client.ts`), `decrypt` (`src/lib/crypto.ts`), `auth` session helper, CHUNK_SIZE pattern, CSV utilities (`src/lib/apic/csv.ts`).

## Verification

1. **Schema migration applies cleanly** — `bun prisma migrate dev`, inspect `dev.db` with the SQLite tooling of choice, confirm new tables/columns exist.
2. **Single-host resync end-to-end** — against a live APIC host: click "Resync now", confirm `InterfaceSnapshot` populated with ~the number of physical interfaces on the fabric, `InterfaceSample` has the same count with null deltas (first sample).
3. **Delta computation** — run resync a second time after waiting (counters will have moved on a live fabric). Confirm new samples have non-null deltas. Confirm `current < previous` cases (e.g., simulate by manually editing a previous sample's `rxErrors` to a higher value) result in null deltas.
4. **Page render** — open `/interface-health`, confirm table renders with default `usage=epg` filter, that flipping the filter to `infra` shows fabric links, and search/filter work.
5. **Export round-trip** — export a date range, open the CSV, sanity-check column count and row count match the sample query.
6. **Cascade behaviour** — delete an `ApicHost` row, confirm associated snapshots and samples cascade.
7. **Type-check** — `bun typecheck` (or whatever the project's check command is) passes with `BigInt` columns through Prisma.

## Open Implementation Notes

- BigInt serialisation across the JSON boundary needs a `toString()` step (Prisma will return `bigint`, JSON.stringify will throw on it). Probably worth a helper.
- The "find previous sample" lookup at ingest is `N` extra reads. For ~500 interfaces this is fine; if it becomes hot we can batch-fetch all latest samples upfront in one query.
- Counter reset detection compares scalar BigInts — straightforward, but write a small unit test against `src/lib/apic/interfaces.ts` to lock the semantics in.
