# Endpoint Move / VLAN / EPG History — Design

**Date:** 2026-06-19
**Status:** Approved (design)

## Problem

The `Endpoint` table uses `@@unique([apicHostId, mac, ip])` as identity, and
`resyncEndpoints` upserts each fetched endpoint **in place** — overwriting
`vlan`, `node`, `interface`, and `epgDescr`. When an endpoint moves ports/leaf,
changes VLAN, or is reassigned to a different EPG, the previous values are
silently clobbered. There is no way to know a change happened or where the
endpoint used to be.

We want an **audit history**: for any endpoint (mac+ip), see everywhere it has
been throughout the capture/resync lifetime, with only the current placement
marked active.

## Decision

**Option A — append-only versioned rows in the `Endpoint` table (SCD2).**

The `Endpoint` table holds both current state and history. There is exactly one
`isActive: true` row per (apicHostId, mac, ip); every superseded placement
remains as an `isActive: false` row. The table backs the UI directly: searching
an IP returns multiple rows, exactly one marked Active.

Rejected: Option B (separate `EndpointEvent` delta table). It is more consistent
with the existing snapshot+sample idiom and keeps `Endpoint` clean, but it
records deltas rather than placement rows, so the desired UI ("table of
placements, one active") would require reconstruction. Option A maps directly to
the UI requirement.

### What counts as a "change" (opens a new row)

A new active row is created when any of these differ from the current active row:

- `node`
- `interface`
- `vlan` (encap)
- **EPG**, derived from `dn` by stripping the `/cep-<MAC>` suffix
  (`uni/tn-X/ap-Y/epg-Z/cep-MAC` → `uni/tn-X/ap-Y/epg-Z`)

`epgDescr` changing **alone** is NOT a move — it is a relabel. When only
`epgDescr` differs, update it in place on the active row (no new row).

### Append-only semantics

If an endpoint moves A → B → A, the result is **three rows** (A cleared, B
cleared, A active). Returning to a prior location does not reuse the old row —
the timeline reflects that it genuinely left and came back.

## Schema changes

`Endpoint` model:

- **Remove** `@@unique([apicHostId, mac, ip])` (multiple rows per mac+ip now).
- **Add** `clearedAt DateTime?` — set when a placement stops being current
  (superseded by a move or the endpoint left the fabric). `null` while active.
- **Add** `@@index([apicHostId, mac, ip])` — supports the active-row lookup
  during resync and the per-endpoint history query.

No new tables.

### Integrity note

"Only one active row per mac+ip" can no longer be enforced by the database —
Prisma/SQLite cannot express a partial unique index (`unique where isActive`).
The invariant is enforced in application code: `resyncEndpoints` is the single
writer and performs compare-and-branch inside a transaction. A test asserts the
invariant holds.

## Resync logic

Replaces the current `updateMany(isActive=false) → chunked upsert` flow.

1. Fetch + dedupe by (mac, ip) — unchanged.
2. Load all active rows for the host into a `Map` keyed by `mac|ip`.
3. For each fetched row:
   - **No active row** → insert new active row (`firstSeenAt = lastSeenAt = now`).
   - **Active row, move-attrs equal** → update `lastSeenAt = now`; if only
     `epgDescr` differs, also refresh `epgDescr` in place.
   - **Active row, move-attrs differ** → update old row
     `{ isActive: false, clearedAt: now }`; insert new active row.
   - Mark `mac|ip` as seen.
4. Any active row NOT seen in this fetch → update `{ isActive: false,
   clearedAt: now }` (endpoint left the fabric).

`attrsEqual(a, b)` compares `node`, `interface`, `vlan`, and EPG-from-`dn`.

Inserts/updates remain chunked and transactional, consistent with the current
`ENDPOINTS_CHUNK_SIZE` approach.

## History query

"Where has this endpoint been?":

```sql
SELECT node, interface, vlan, dn, epgDescr, firstSeenAt, clearedAt, isActive
FROM endpoint
WHERE apicHostId = ? AND mac = ? AND ip = ?
ORDER BY firstSeenAt;
```

## Migration & existing data

- The current 7,000+ rows already satisfy "one row per (mac, ip)" (enforced by
  the soon-to-be-dropped constraint), so they become the initial set of active
  rows with **no transformation**.
- Dropping the unique index is metadata-only on SQLite (no table rewrite).
  Adding a nullable column and an index over ~7k rows is cheap.
- Existing `isActive: false` rows (endpoints that already left) keep
  `clearedAt = null`. Optional: backfill `clearedAt = lastSeenAt` for them as a
  best-guess. Not required for v1.

## Growth / retention

Append-only means the table grows with each move (not each resync — identical
resyncs add zero rows). With ~7k endpoints and infrequent moves, growth is
gradual. A retention policy (prune `isActive: false` rows older than N months)
can be added later if churn is high. Out of scope for v1.

## Testing

- Resyncing identical data twice adds **zero** new rows (only `lastSeenAt`
  bumped).
- A `node` / `interface` / `vlan` / EPG change produces exactly one new active
  row and flips the prior row to `isActive: false` with `clearedAt` set.
- `epgDescr`-only change updates in place — no new row.
- A → B → A yields three rows; exactly one is active.
- An endpoint absent from a fetch is flipped inactive with `clearedAt` set.
- Invariant: after any resync, at most one active row exists per (mac, ip).
```
