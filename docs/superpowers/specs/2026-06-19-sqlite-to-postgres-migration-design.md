# SQLite → Postgres Migration — Design

**Date:** 2026-06-19
**Status:** Approved (design)

## Problem

The app runs on SQLite (`prisma/dev.db`). We want to move the entire application
— all tables and all existing data — onto a Dockerized local Postgres instance,
with no data loss and no behavioral regressions. This is a full cutover: after
migration the app targets Postgres only (no dual-provider support).

Motivation: Postgres unlocks a DB-enforced partial unique index
(`WHERE is_active`) as a hard backstop for the endpoint one-active-row invariant,
and makes wrapping the endpoint resync in a single atomic transaction cheap
(no global write-lock contention). Those follow-ups are out of scope here — this
spec only covers the migration itself.

## Constraints / decisions

- **Local only, single instance.** Not serverless, not multi-instance. Therefore
  **no connection pooling** (PgBouncer/Accelerate) is needed.
- **Docker via committed `docker-compose.yml`** (Postgres 17, named volume, port
  5432, default creds).
- **Data migration via a Prisma-to-Prisma TypeScript script** (not pgloader/CSV).
- **Full cutover**, not dual-provider.
- **Keep `prisma/dev.db` untouched** after migration as the rollback path.

## Codebase findings (why this is low-risk)

- **Zero raw SQL** in the codebase (`$queryRaw`/`$executeRaw`/`queryRawUnsafe`
  → 0 hits). All access is through Prisma's dialect-agnostic query API.
- **Column types port natively:** only `String`, `Boolean`, `DateTime`, `Int`,
  plus `BigInt` (interface counters) and `Json?` (`AuditLog.payload`). No
  `@db.*` custom types, no `Decimal`/`Bytes`.
- **22 production `contains:` filters across 5 files, 0 `mode: 'insensitive'`.**
  SQLite `LIKE` is case-insensitive for ASCII by default; Postgres `contains` is
  case-sensitive. This is the one silent-regression risk and must be fixed. Sites:
  `src/lib/endpoints/query.ts` ×7 (unit-tested — `query.test.ts` ×7 assertions
  also update), `faults/page.tsx` ×3, `nodes/page.tsx` ×5,
  `health-scores/page.tsx` ×3, `interface-health/page.tsx` ×4.
- **`@updatedAt` is effectively dead data.** Defined on `User`, `Session`,
  `Account`, `Verification`, `ApicHost`. The four auth tables' `updatedAt` is
  never read by app code (better-auth internal; sessions validate on
  token/`expiresAt`). `ApicHost.updatedAt` is selected into the `SafeApicHost`
  DTO (`src/actions/apic-hosts.ts:47`) but rendered by no `.tsx`. Restamping it
  during copy has zero functional or visible impact — no special handling needed.
- **`createdAt` IS used** (audit log display, user list ordering) but has no
  `@updatedAt` behavior, so it copies through exactly as-is.

## Phases

### Phase A — Postgres infrastructure

- Add `docker-compose.yml`: service `postgres:17`, named volume for persistence,
  `5432:5432`, env `POSTGRES_USER=netroku`, `POSTGRES_PASSWORD=netroku`,
  `POSTGRES_DB=netroku`.
- Start it; verify it accepts connections.
- Set `DATABASE_URL` in `.env` and `.env.example` to
  `postgresql://netroku:netroku@localhost:5432/netroku?schema=public`.
- README: document `docker compose up -d` as a setup step.

### Phase B — Schema cutover (code)

- `prisma/schema.prisma`: `provider = "sqlite"` → `provider = "postgresql"`.
  No other schema field edits (BigInt/Json port natively).
- **Reset migration history:** delete the contents of `prisma/migrations/`
  (the 10 SQLite-dialect migrations won't replay on Postgres), then
  `prisma migrate dev --name init` against the running Postgres → fresh baseline
  migration + empty tables.
- **Case-insensitive search:** add `mode: 'insensitive'` to all 22 production
  `contains:` filters (`endpoints/query.ts` ×7, `faults/page.tsx` ×3,
  `nodes/page.tsx` ×5, `health-scores/page.tsx` ×3, `interface-health/page.tsx`
  ×4), and update the 7 `query.test.ts` assertions to match. Own task with a
  verification step.
- Run `bun test` + `bun run lint`: app code must still compile and pass.

### Phase C — Data migration (Prisma-to-Prisma)

A Prisma client has its provider baked in at generate time, so one client cannot
talk to both databases. Use two clients:

- **Read side:** a temporary `prisma/schema.sqlite.prisma` (provider `sqlite`,
  `url` → the old `prisma/dev.db`, `generator` output to a separate path, e.g.
  `prisma/generated/sqlite-client`). Generate this client.
- **Write side:** the main client (now Postgres).
- **Script:** `scripts/migrate-sqlite-to-postgres.ts` copies every table in
  FK-safe order, preserving ids and timestamps, using chunked `createMany`:
  1. `User`, `Verification`, `ApicHost` (no parents)
  2. `Session`, `Account` (→ User)
  3. `Endpoint`, `InterfaceSnapshot`, `FaultSnapshot`, `FaultCountSample`,
     `HealthScoreSnapshot`, `HealthScoreSample`, `NodeSnapshot`,
     `HardwareComponent`, `NodeStatusSample` (→ ApicHost)
  4. `InterfaceSample` (→ InterfaceSnapshot)
  5. `AuditLog` (standalone)
- **Verify:** after each table, assert source row count == destination row count;
  fail loudly on mismatch. Print a per-table summary.
- After a verified run, delete the temporary sqlite schema and its generated
  client.

Type notes for the copy:

- `BigInt` columns (`InterfaceSample` counters): Prisma returns/accepts `bigint`;
  passes through to Postgres `bigint` unchanged.
- `Json?` (`AuditLog.payload`): Prisma returns a JS value; writes to `jsonb`.
- `DateTime`: copied as `Date` objects; no timezone reinterpretation.

### Phase D — Verify & rollback

- Start the app against Postgres and smoke-test:
  - Endpoint/fault/interface search returns case-insensitively (e.g. upper-case
    query matches lower-case MAC) — confirms Phase B's `mode: 'insensitive'`.
  - Dashboard counts and a representative list page match pre-migration values.
  - A resync runs successfully end-to-end.
- **Rollback:** `prisma/dev.db` is left untouched. To revert: restore
  `provider = "sqlite"` + the old `DATABASE_URL`, restore the SQLite migrations,
  regenerate the client. Document this in the README.

## Out of scope (follow-ups, not this spec)

- Postgres partial unique index (`WHERE is_active`) for the endpoint invariant.
- Wrapping the endpoint resync in a single atomic transaction.
- Production/remote Postgres, pooling, HA.

## Risk summary

Low. No raw SQL to port. Two watch items: the 14 search filters (mechanical,
verified by smoke test) and data-copy correctness (verified by per-table
row-count assertions). Everything else is configuration. `dev.db` retained as a
clean rollback.
