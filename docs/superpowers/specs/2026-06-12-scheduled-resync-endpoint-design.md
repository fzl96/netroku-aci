# Scheduled "resync all data" endpoint — Design

**Date:** 2026-06-12
**Branch:** `dev`
**Status:** Approved (pending spec review)

## Problem

The app pulls ACI data from APIC into the local DB via two manual **Resync** buttons:
`POST /api/endpoints/resync` and `POST /api/interfaces/resync`. Both require an
interactive login session and the operator typing the APIC username/password each time
("credentials are used for this resync only" — they are not stored).

We want a scheduler (external cron) to refresh this data periodically, with no human
present. That needs a machine-callable endpoint that authenticates without a browser
session and obtains APIC credentials without an interactive prompt.

## Decisions (settled during brainstorming)

| Decision | Choice |
| --- | --- |
| Base branch | Work directly on `dev`. |
| APIC credentials | Scheduler passes them per-host in the request body. **No DB schema change.** |
| Endpoint auth | Shared bearer token (`SCHEDULER_TOKEN` in `.env`). |
| Scope per call | Both datasets (endpoints + interfaces), multiple hosts. |
| Endpoint path | `POST /api/cron/resync`. |
| Manual routes | Refactor them to share the extracted persistence logic. |

## Overview

New endpoint **`POST /api/cron/resync`** — the unattended equivalent of the manual
Resync buttons. One call refreshes **both** datasets across **multiple** hosts.

## Authentication

- Scheduler sends `Authorization: Bearer <SCHEDULER_TOKEN>`.
- `SCHEDULER_TOKEN` is read from `.env`. Comparison uses `crypto.timingSafeEqual`.
- Fail closed:
  - `SCHEDULER_TOKEN` unset → `503 Service Unavailable` (never accept-all).
  - Missing / malformed / wrong token → `401 Unauthorized`.
- No login session is consulted.

## Request shape

```json
{
  "hosts": [
    { "apicHostId": "clx...", "username": "admin", "password": "..." }
  ]
}
```

- `hosts` must be a non-empty array. Empty / missing → `400`.
- Each entry requires `apicHostId`, non-empty `username`, non-empty `password`.
  An invalid entry becomes a per-host error; it does not abort the whole call.
- An unknown `apicHostId` (not found in DB) → that host's result is an error; others proceed.

## Behaviour

- Hosts are processed **sequentially** (SQLite — avoid concurrent write contention).
- For each host: resync **endpoints**, then **interfaces** (sequential per host to avoid
  hammering a single APIC).
- **Failures are isolated.** A failing host, or a failing dataset within a host, records
  its error and the run continues. Overall HTTP status is always `200`; the body's
  `status` field summarizes the outcome.
- Each dataset resync writes an `AuditLog` row with `userId: null`,
  `userName: "scheduler"`, reusing the existing `resync.endpoints` / `resync.interfaces`
  actions, with `status` = `success` | `partial` | `failure`, so scheduled runs appear in
  History alongside manual ones.

### Overall `status` derivation

- `success` — every dataset of every host synced.
- `failure` — every dataset of every host failed.
- `partial` — anything in between.

## Response shape

```json
{
  "status": "partial",
  "results": [
    {
      "apicHostId": "clx...",
      "host": "apic1",
      "endpoints": { "synced": 120, "total": 340 },
      "interfaces": { "error": "APIC authentication failed" }
    }
  ]
}
```

Each result entry has `endpoints` and `interfaces`, each being either
`{ synced, total }` or `{ error }`. A host that fails lookup/validation yields a single
top-level `error` for the whole entry (no `endpoints`/`interfaces` keys). `host` (the
display name) is included when the `apicHostId` resolves; for an unknown `apicHostId` it
is `null` and the entry carries `error: "Host not found"`.

## Code structure — reuse, not duplication

Today both manual routes inline the full fetch + dedupe + upsert (+ delta) logic. We
extract the persistence logic into two pure functions that the manual routes **and** the
new cron route share:

- `lib/apic/endpoints.ts` → `resyncEndpoints({ apicHostId, host, username, password }) → { synced, total }`
  (fetch from APIC, dedupe by `mac|ip`, mark-inactive + chunked upsert, count total).
- `lib/apic/interfaces.ts` → `resyncInterfaces({ apicHostId, host, username, password }) → { synced, total }`
  (fetch, dedupe by `dn`, 3-phase snapshot/sample upsert with deltas, update
  `lastInterfaceSyncAt`, count total).

These functions own data fetching + persistence only. They do **not** touch auth or audit
— callers own that, so the two contexts (session user vs. scheduler) attribute audit
differently.

Resulting call sites:

- `POST /api/endpoints/resync` — session check → `resyncEndpoints(...)` → audit as the
  logged-in user. Behaviour unchanged.
- `POST /api/interfaces/resync` — session check → `resyncInterfaces(...)` → audit as the
  logged-in user. Behaviour unchanged.
- `POST /api/cron/resync` (new) — bearer-token check → loop hosts → call both lib fns →
  audit as `scheduler` → aggregate results.

This keeps the upsert/delta logic in one tested place; manual and scheduled paths cannot
drift.

## Testing

- TDD unit tests for `resyncEndpoints` / `resyncInterfaces`: mock the APIC fetch
  (`fetchEndpointsFromApic` / `fetchInterfacesFromApic`), assert dedupe, upsert,
  mark-inactive, delta computation, and totals.
- Route tests for `/api/cron/resync`:
  - missing `SCHEDULER_TOKEN` env → `503`.
  - missing / wrong bearer token → `401`.
  - empty/missing `hosts` → `400`.
  - one host's dataset throwing → response `status: "partial"`, other host's results intact.
  - all success → `status: "success"`.
- Confirm the refactored manual routes still return `{ synced, total }` unchanged.

## Out of scope

- The cron job / scheduler configuration itself (set up externally; we only provide the
  endpoint).
- Storing APIC credentials in the DB (creds-in-request was chosen).
- Any change to what data is fetched from APIC (we reuse the existing fetch functions).
