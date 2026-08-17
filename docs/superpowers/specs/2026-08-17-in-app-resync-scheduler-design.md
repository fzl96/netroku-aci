# In-app resync scheduler — Design

**Date:** 2026-08-17
**Branch:** `feat/docker-compose-deployment`
**Status:** Approved (pending spec review)

## Problem

Scheduled resyncs are configured outside the app. A systemd timer on the host runs
`curl -X POST /api/cron/resync` with the entire payload — which hosts to sync and their
APIC credentials — inlined in `/etc/netroku-resync.env` as `RESYNC_BODY`:

```
RESYNC_BODY={"hosts":[{"apicHostId":"...","username":"...","password":"..."}, ...]}
```

Three problems follow from that:

- **Changing the schedule requires host access.** Adding a device or altering the interval
  means editing a root-owned env file and reloading systemd — not something an operator
  can do from the UI.
- **The schedule is invisible to the app.** Nothing in the product knows a schedule exists,
  so nothing can display it, validate it, or warn when it stops running.
- **It does not survive containerization.** Once the app runs in Docker Compose, a host
  systemd timer is the one piece left outside the deployment.

We want the schedule to be a first-class, UI-editable part of the app: an admin picks
which devices sync and how often, and the app owns execution.

## Decisions (settled during brainstorming)

| Decision | Choice |
| --- | --- |
| APIC credentials | **Stored encrypted in the DB** via the existing `src/lib/crypto.ts` (AES-256-GCM). Supersedes the creds-in-request decision below. |
| Trigger mechanism | Dumb ticker container POSTs `/api/cron/tick` every ~60s; all policy lives in Postgres. |
| Granularity | One schedule per APIC host. Datasets stay all-or-nothing. |
| Interval semantics | Relative — N minutes **after the previous run completes** (like `OnUnitActiveSec`). Not wall-clock cron. |
| Legacy device sync | Out of scope. The Python collector keeps its own timer. |
| `/api/cron/resync` | Kept contract-compatible so the existing systemd unit works during migration. |

### Supersedes a prior decision

`2026-06-12-scheduled-resync-endpoint-design.md` listed *"Storing APIC credentials in the
DB"* as explicitly out of scope, choosing creds-in-request instead. That was correct for an
externally-driven scheduler, where the external system already held the secrets. An in-app
scheduler has no such caller — the app itself must initiate runs with no human present, so
the credentials have to live somewhere the app can read unattended. This design reverses
that decision deliberately. See **Security model** for what the reversal does and does not
buy.

## Architecture

```
ticker container ──POST /api/cron/tick──> app ──claim next due schedule──> Postgres
  (60s loop, no config)                    │
                                           └──> resyncHost() ──> APIC ──> snapshot tables
                                                     └──> recordAudit('scheduler')
```

The ticker holds no schedule knowledge. It is stateless and idempotent: a missed,
duplicated, or interrupted tick costs nothing, because the claim query alone decides what
is due. Losing the ticker delays syncs but can never double-run or corrupt them.

## Data model

An optional 1:1 extension of `ApicHost`:

```prisma
model ResyncSchedule {
  id              String    @id @default(cuid())
  apicHostId      String    @unique
  apicHost        ApicHost  @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  enabled         Boolean   @default(false)
  intervalMinutes Int       @default(480)      // 8h — matches the current systemd timer
  encUsername     String                       // crypto.ts ciphertext
  encPassword     String                       // crypto.ts ciphertext
  nextRunAt       DateTime?
  lastRunAt       DateTime?
  lastStatus      String?                      // success | partial | failure
  lastDetail      String?
  runningAt       DateTime?                    // claim marker / overlap guard
  updatedByUserId String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([enabled, nextRunAt])
  @@map("resync_schedule")
}
```

`ApicHost` gains `schedule ResyncSchedule?`.

Three load-bearing choices:

- **`nextRunAt` is the source of truth**, not `lastRunAt + interval` computed at read time.
  "Run now" and mid-flight interval changes become a single field write, and due-selection
  reduces to one indexed comparison.
- **`runningAt` is a claim marker, not a status.** It is what makes overlapping runs
  impossible when a resync outlives its own interval.
- **Relative intervals** mean no drift and no catch-up storms. A future "daily at 02:00"
  feature changes only how `nextRunAt` is computed; nothing else in this design moves.

## Execution

`POST /api/cron/tick` — authorized with the same `SCHEDULER_TOKEN` bearer via the existing
`isAuthorized()`. Empty body.

The handler loops: **claim exactly one due schedule, run it, finalize it, repeat** until no
schedule is due.

1. **Claim one row atomically.** One raw statement, so two overlapping ticks cannot claim
   the same row:

   ```sql
   UPDATE resync_schedule
      SET "runningAt" = now()
    WHERE id = (
      SELECT id FROM resync_schedule
       WHERE enabled
         AND "nextRunAt" <= now()
         AND ("runningAt" IS NULL OR "runningAt" < now() - interval '2 hours')
       ORDER BY "nextRunAt"
       LIMIT 1
       FOR UPDATE SKIP LOCKED
    )
   RETURNING id, "apicHostId", "encUsername", "encPassword", "intervalMinutes";
   ```

   Raw SQL because Prisma's `updateMany` does not return rows, and select-then-update
   would race.

2. **Claim one at a time, not in bulk.** Bulk-claiming every due row and then running them
   sequentially would stamp `runningAt` on the last host while the first ones are still
   running. That host then sits "claimed but not started" for the whole queue's duration,
   and once that wait exceeds the stale window a second tick reclaims and **double-runs**
   it — defeating the guard entirely. Claiming per-iteration keeps `runningAt` an accurate
   record of when work actually began.

3. **Run it**, decrypting credentials and calling `resyncHost()`. One host at a time stages
   the load across APICs and ensures a slow controller delays only its own schedule.

4. **Finalize in a `finally` block**: `lastRunAt`, `lastStatus` (from the existing
   `summarizeResults`), `lastDetail`, `nextRunAt = now() + intervalMinutes`,
   `runningAt = null`. A thrown error must never leave a row claimed.

5. **The stale-claim clause is load-bearing.** If the container dies mid-resync,
   `runningAt` is never cleared and that host would be wedged forever. Reclaiming after a
   fixed window fixes it with no external janitor process. The window (2h) must exceed the
   longest plausible **single-host** resync — with per-iteration claiming it no longer has
   to cover the whole queue. `FOR UPDATE SKIP LOCKED` additionally prevents two
   simultaneous ticks from contending on the same candidate row.

Because `nextRunAt` is only advanced at finalization, a schedule whose interval elapses
while it is still running simply becomes due again on the next tick — it never queues up
duplicate runs.

A tick that works through several due hosts may run for many minutes. That is fine: if the
ticker's `curl` times out, the server continues and finalization still lands — only the
response body is lost, and the next tick skips still-claimed rows.

### Refactor

The ~150 lines of per-host orchestration currently inline in
`src/app/api/cron/resync/route.ts` move to **`src/lib/apic/resync-host.ts`**, exposing
`resyncHost({ apicHostId, host, username, password })`. Then:

- `/api/cron/resync` becomes a thin wrapper — **external contract unchanged**, so the
  existing systemd unit keeps working through migration.
- `/api/cron/tick` is the second caller.
- `recordAudit` stays as-is (`userName: 'scheduler'`), so the History page needs no changes.

## Server actions

`src/actions/resync-schedules.ts`, following `apic-hosts.ts` conventions (zod validation,
`requireAdmin()`, `recordAudit`, `ActionResult<T>`, `cache()`):

| Action | Notes |
| --- | --- |
| `getResyncSchedules()` | `cache()`d. **Left-joins from `ApicHost`** so unscheduled hosts appear as "Not scheduled" — the UI lists devices, not schedule rows. |
| `upsertResyncSchedule(apicHostId, values)` | `password` **optional on update**; omitted means keep existing. Enabling requires credentials to exist. |
| `runResyncScheduleNow(apicHostId)` | Sets `nextRunAt = now()`. |
| `deleteResyncSchedule(apicHostId)` | |

```ts
type SafeResyncSchedule = {
  apicHostId: string
  hostName: string; host: string
  enabled: boolean
  intervalMinutes: number
  username: string          // decrypted — shown as "runs as"
  hasPassword: boolean      // never the password itself
  lastRunAt: Date | null; lastStatus: string | null; lastDetail: string | null
  nextRunAt: Date | null; isRunning: boolean
}
```

`toSafe()` is the security boundary and gets an explicit test asserting `encPassword`
never appears in the returned payload.

**"Run now" writes `nextRunAt = now()` rather than executing inline.** This keeps one
execution path, avoids duplicated orchestration, and avoids a multi-minute server action
that a proxy may time out. Accepted cost: up to 60s of latency, so the toast reads
"queued" and the row shows *running…* once `runningAt` is set. A streaming
"execute and watch" route would be more satisfying; it is a deliberate v1 omission.

## UI

New `/scheduler` page, admin-gated with the existing `redirect('/signin')` + `notFound()`
pattern, plus a sidebar entry under **Infrastructure** beside APIC Hosts
(`adminOnly: true`).

One row per registered host:

| Host | Enabled | Interval | Runs as | Last run | Next run | |
| --- | --- | --- | --- | --- | --- | --- |
| DC-APIC-01 | toggle | every 8h ▾ | ven.mbintang | ✓ 2h ago | in 5h 48m | ⋯ |

- **Interval** presets (15m / 30m / 1h / 4h / 8h / 24h) plus custom minutes. The zod
  schema enforces a **15-minute floor** and a 1-week ceiling — nothing should permit
  `1`, which would hammer every APIC every minute.
- Label intervals **"every 8h after completion"**, never "at 00:00". The semantics are
  relative and the UI must not imply wall-clock scheduling.
- **Last run** shows a status badge linking to History filtered to that host. `AuditLog`
  already holds every dataset row, so this costs nothing new.
- **"Test credentials"** button reusing `POST /api/apic/connect` (`aaaLogin`). Without it,
  a typo means a schedule that fails silently every 8 hours; validation belongs at save
  time.
- **Dead-ticker warning:** badge any row where `enabled && nextRunAt < now - 2×interval`.
  Otherwise a crashed ticker container is indistinguishable from a healthy idle one —
  the same blind spot the current systemd setup has.

## Security model

State this plainly in the README rather than glossing it.

Ciphertext lives in Postgres while `ENCRYPTION_KEY` sits in `.env` on the same host. This
protects against **leaked database dumps and backups**, a real and common exposure path.
It does **not** protect against host compromise: an attacker with filesystem access holds
both halves. The threat model is "our backups leak", not "our server is owned".

Consequences to carry through:

- `ENCRYPTION_KEY` moves from **unused** (nothing imports `crypto.ts` today) to
  **load-bearing and required**.
- The README claim *"Credentials are never stored"* (README:404) becomes false on ship and
  must be rewritten, not left to rot.
- Audit rows for schedule CRUD use the acting admin's name, not `scheduler`. Passwords
  never enter `detail` or `payload`.
- **Key rotation is unsupported in v1.** Changing `ENCRYPTION_KEY` invalidates every
  stored credential and requires re-entering them. A `keyVersion` column would enable real
  rotation; omitting it is a recorded decision, not an oversight.

## Error handling

- **Decryption failure is per-schedule, never fatal.** A corrupt row or changed key marks
  that host `lastStatus = 'failure'` with `lastDetail = 'Credential decryption failed'`;
  the tick continues to remaining hosts. One bad row must not stop the others.
- **APIC/dataset errors** reuse the existing per-dataset capture and `summarizeResults`
  partial/failure semantics.
- **Missing `SCHEDULER_TOKEN`** → `503`, matching `/api/cron/resync`. Bad token → `401`.
- **A crash mid-run** is recovered by the stale-claim clause on the next tick.

## Deployment

The ticker is the same `curlimages/curl` container already in `docker-compose.yml`, with
all configuration removed — `RESYNC_BODY` ceases to exist:

```yaml
scheduler:
  image: curlimages/curl:8.11.0
  depends_on: [app]
  env_file: [.env]            # only SCHEDULER_TOKEN now
  environment:
    TICK_URL: http://app:3000/api/cron/tick
    TICK_INTERVAL_SECONDS: 60
  volumes: ["./scheduler/tick.sh:/tick.sh:ro"]
  entrypoint: ["/bin/sh", "/tick.sh"]
  restart: unless-stopped
```

A cron implementation (`supercronic`, `crond`) would add a config format for something
with no configuration left. If two containers ever matter more than the ticker's
robustness, an `instrumentation.ts` `setInterval` calling the same claim-and-run function
is the fallback — the rest of the design is unchanged.

## Testing

Bun tests, colocated `*.test.ts` per existing convention:

- `nextRunAt` computation and the due-selection predicate.
- Stale-claim reclaim boundary (just inside / just outside the window).
- Claiming is exclusive: a row already claimed within the window is not returned again, and
  a schedule still running is never claimed a second time.
- Crypto roundtrip **and GCM tamper rejection** (mutated authTag must throw).
- `toSafe()` leak-proofing — no `encPassword` in output.
- Per-schedule decryption failure isolates to one host; others still run.
- Interval validation rejects below-floor and above-ceiling values.
- `/api/cron/tick`: missing token → 503, wrong token → 401, no due schedules → no-op.
- `summarizeResults` is already covered.

## Rollout

The contract-compatible refactor is what makes this safe to stage:

1. Ship schema + `resyncHost()` extraction + `/api/cron/tick`. systemd still running;
   nothing switched over.
2. Populate schedules in the UI, left **disabled**.
3. `systemctl disable --now netroku-resync.timer`.
4. Enable schedules; watch History through one full cycle.
5. Point the compose ticker at `/api/cron/tick`; drop `RESYNC_BODY` from `.env`.
6. Delete `/etc/netroku-resync.env`; rotate the APIC credentials and `SCHEDULER_TOKEN`
   that were exposed during this work.

Step 3 disables the timer but **must not delete `netroku-resync.service`** — its second
`ExecStart` runs the legacy Python collector, which stays on its own schedule. Strip the
unit down to that `ExecStart` and give it its own timer.

Docs to update: README env table (`ENCRYPTION_KEY` now required), the scheduler paragraph
(README:402), the "credentials never stored" paragraph (README:404), and
`docs/admin/deployment`.

## Out of scope

- **Legacy device sync scheduling.** The Python collector pushes *into* this app via
  `/api/ingest/legacy/*`; the app cannot invoke it without that CLI exposing an HTTP
  trigger.
- **Cron expressions / wall-clock schedules.** Relative intervals only.
- **Per-dataset intervals.** Datasets remain all-or-nothing per host.
- **Encryption key rotation.** See Security model.
- **Inline "run now" execution.** Queued via `nextRunAt` instead.
- **Multi-instance app deployments.** The claim query is safe against concurrent ticks,
  but no other part of this design assumes horizontal scaling.
