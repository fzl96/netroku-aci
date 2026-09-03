# SQLite → Postgres Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the entire app (all tables + all existing data) from SQLite to a Dockerized local Postgres, with no data loss and no search regression.

**Architecture:** Full cutover. Stand up Postgres 17 via docker-compose, flip the Prisma datasource provider, reset migration history, fix case-sensitivity in search filters, then copy all data with a one-time Prisma-to-Prisma script (a temporary second SQLite schema is the read side). `prisma/dev.db` is retained untouched as the rollback path.

**Tech Stack:** Prisma 6, Postgres 17, Docker Compose, Next.js, TypeScript, `bun test`, `tsx`.

## Global Constraints

- Postgres service: image `postgres:17`, user `netroku`, password `netroku`, db `netroku`, port `5432`.
- `DATABASE_URL` = `postgresql://netroku:netroku@localhost:5432/netroku?schema=public`.
- Full cutover — the app targets Postgres only. The only SQLite artifact that remains is `prisma/schema.sqlite.prisma` (read-only, used solely by the data-copy script) and `prisma/dev.db` (rollback).
- `prisma/dev.db` must NOT be modified or deleted (it is the rollback).
- All scalar data copied with original ids and timestamps preserved. `@updatedAt` may be restamped on copy — confirmed harmless (no UI reads it; auth validates on token/expiresAt).
- `bun test` and `bun run lint` must stay green. There are 6 PRE-EXISTING lint errors in unrelated client components (refs-during-render / setState-in-effect) — do not introduce new ones.
- Do not touch the unrelated working-tree file `src/app/(app)/interface-health/InterfaceHealthClient.tsx` except for the specific `contains:` edits in Task 3 on `interface-health/page.tsx` (a different file).

---

### Task 1: Postgres infrastructure (Docker + env)

**Files:**

- Create: `docker-compose.yml`
- Modify: `.env.example` (line 2)
- Modify: `.env` (DATABASE_URL line — local, gitignored)

**Interfaces:**

- Produces: a running Postgres reachable at `postgresql://netroku:netroku@localhost:5432/netroku`.

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17
    container_name: netroku-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: netroku
      POSTGRES_PASSWORD: netroku
      POSTGRES_DB: netroku
    ports:
      - '5432:5432'
    volumes:
      - netroku-pgdata:/var/lib/postgresql/data

volumes:
  netroku-pgdata:
```

- [ ] **Step 2: Start Postgres and verify it accepts connections**

Run: `docker compose up -d && sleep 3 && docker compose exec postgres pg_isready -U netroku`
Expected: `/var/run/postgresql:5432 - accepting connections`

- [ ] **Step 3: Update `.env.example`**

Change line 2 from:

```
DATABASE_URL="file:./dev.db"
```

to:

```
DATABASE_URL="postgresql://netroku:netroku@localhost:5432/netroku?schema=public"
```

- [ ] **Step 4: Update local `.env`**

In `.env`, change the `DATABASE_URL` line to the same Postgres URL:

```
DATABASE_URL="postgresql://netroku:netroku@localhost:5432/netroku?schema=public"
```

(`.env` is gitignored — it won't be committed, but the running app needs it.)

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "chore(db): add dockerized postgres and point DATABASE_URL at it"
```

---

### Task 2: Schema provider flip + migration reset

**Files:**

- Modify: `prisma/schema.prisma:7-10` (datasource block)
- Delete: `prisma/migrations/` (all 10 SQLite migrations + lock)
- Create: `prisma/migrations/<timestamp>_init/` (generated)

**Interfaces:**

- Consumes: running Postgres from Task 1.
- Produces: Postgres schema with all tables empty; regenerated Prisma client targeting Postgres.

- [ ] **Step 1: Flip the datasource provider**

In `prisma/schema.prisma`, change the datasource block (lines 7-10) from:

```prisma
datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

to:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Leave all model definitions unchanged — `BigInt` and `Json?` port natively to Postgres.

- [ ] **Step 2: Remove the SQLite migration history**

Run: `rm -rf prisma/migrations`
(The 10 existing migrations are SQLite-dialect SQL and cannot replay on Postgres; we regenerate a fresh baseline.)

- [ ] **Step 3: Generate the Postgres baseline migration**

Run: `bun run prisma:migrate --name init`
Expected: Prisma connects to Postgres, creates a new `prisma/migrations/<timestamp>_init/migration.sql` with `CREATE TABLE` statements for every model, applies it, and regenerates the client. Ends with "Your database is now in sync with your schema."
If it errors about a shadow database, confirm Postgres is running (`docker compose ps`) — the `netroku` superuser can create the shadow DB automatically.

- [ ] **Step 4: Verify migration state and that the app still builds**

Run: `bunx prisma migrate status && bun test && bun run lint`
Expected: migrate status reports "Database schema is up to date!"; all tests pass; no NEW lint errors (the 6 pre-existing ones may remain).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): switch prisma datasource to postgresql with fresh baseline"
```

---

### Task 3: Case-insensitive search filters

**Files:**

- Modify: `src/lib/endpoints/query.ts:43-51`
- Test: `src/lib/endpoints/query.test.ts:32-43`
- Modify: `src/app/(app)/faults/page.tsx:72-74`
- Modify: `src/app/(app)/nodes/page.tsx:92-94,123-124`
- Modify: `src/app/(app)/health-scores/page.tsx:69-71`
- Modify: `src/app/(app)/interface-health/page.tsx:81-84`

**Interfaces:**

- Produces: all 22 production `contains:` filters carry `mode: 'insensitive'`, restoring SQLite's default case-insensitive search behavior on Postgres.

- [ ] **Step 1: Update the endpoints search test to expect `mode: 'insensitive'` (failing test)**

In `src/lib/endpoints/query.test.ts`, replace the `OR` assertion block (lines 33-42) with:

```ts
      OR: [
        { mac: { contains: 'needle', mode: 'insensitive' } },
        { ip: { contains: 'needle', mode: 'insensitive' } },
        { vlan: { contains: 'needle', mode: 'insensitive' } },
        { node: { contains: 'needle', mode: 'insensitive' } },
        { interface: { contains: 'needle', mode: 'insensitive' } },
        { epgDescr: { contains: 'needle', mode: 'insensitive' } },
        { dn: { contains: 'needle', mode: 'insensitive' } },
      ],
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/lib/endpoints/query.test.ts`
Expected: FAIL — the `buildEndpointWhere` output lacks `mode: 'insensitive'`, so the deep-equal assertion mismatches.

- [ ] **Step 3: Add `mode: 'insensitive'` in `query.ts`**

In `src/lib/endpoints/query.ts`, replace the `OR` array (lines 43-51) with:

```ts
          OR: [
            { mac: { contains: query, mode: 'insensitive' } },
            { ip: { contains: query, mode: 'insensitive' } },
            { vlan: { contains: query, mode: 'insensitive' } },
            { node: { contains: query, mode: 'insensitive' } },
            { interface: { contains: query, mode: 'insensitive' } },
            { epgDescr: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/lib/endpoints/query.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the four page-level search builders**

In `src/app/(app)/faults/page.tsx` (lines 72-74):

```tsx
              { code: { contains: query.trim(), mode: 'insensitive' } },
              { descr: { contains: query.trim(), mode: 'insensitive' } },
              { affectedDn: { contains: query.trim(), mode: 'insensitive' } },
```

In `src/app/(app)/nodes/page.tsx` (lines 92-94 and 123-124):

```tsx
                { name: { contains: trimmedQuery, mode: 'insensitive' } },
                { nodeId: { contains: trimmedQuery, mode: 'insensitive' } },
                { dn: { contains: trimmedQuery, mode: 'insensitive' } },
```

and (the second block, lines 123-124):

```tsx
                { name: { contains: trimmedQuery, mode: 'insensitive' } },
                { nodeId: { contains: trimmedQuery, mode: 'insensitive' } },
```

In `src/app/(app)/health-scores/page.tsx` (lines 69-71):

```tsx
              { name: { contains: query.trim(), mode: 'insensitive' } },
              { node: { contains: query.trim(), mode: 'insensitive' } },
              { dn: { contains: query.trim(), mode: 'insensitive' } },
```

In `src/app/(app)/interface-health/page.tsx` (lines 81-84):

```tsx
              { ifName: { contains: query.trim(), mode: 'insensitive' } },
              { node: { contains: query.trim(), mode: 'insensitive' } },
              { description: { contains: query.trim(), mode: 'insensitive' } },
              { dn: { contains: query.trim(), mode: 'insensitive' } },
```

- [ ] **Step 6: Verify full suite and lint**

Run: `bun test && bun run lint`
Expected: all tests pass; no NEW lint errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/endpoints/query.ts src/lib/endpoints/query.test.ts "src/app/(app)/faults/page.tsx" "src/app/(app)/nodes/page.tsx" "src/app/(app)/health-scores/page.tsx" "src/app/(app)/interface-health/page.tsx"
git commit -m "fix(search): make contains filters case-insensitive for postgres"
```

---

### Task 4: Data migration (Prisma-to-Prisma)

**Files:**

- Create: `prisma/schema.sqlite.prisma` (temporary read-only schema)
- Create: `scripts/migrate-sqlite-to-postgres.ts`
- Modify: `.gitignore` (add generated client path)
- Modify: `package.json` (add `migrate:data` script)

**Interfaces:**

- Consumes: empty Postgres tables (Task 2), untouched `prisma/dev.db`.
- Produces: all rows copied into Postgres, verified by per-table count assertions.

- [ ] **Step 1: Create the temporary SQLite read schema**

Copy the current schema, then point it at the old DB with its own generated client. Run:

```bash
cp prisma/schema.prisma prisma/schema.sqlite.prisma
```

Then in `prisma/schema.sqlite.prisma` replace the `generator` block with:

```prisma
generator sqliteClient {
  provider = "prisma-client-js"
  output   = "./generated/sqlite"
}
```

and replace the `datasource` block with:

```prisma
datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}
```

Leave all model definitions identical (they match the schema `dev.db` was last migrated to).

- [ ] **Step 2: Ignore the generated client and generate it**

Append to `.gitignore`:

```
prisma/generated/
```

Then run: `bunx prisma generate --schema=prisma/schema.sqlite.prisma`
Expected: "Generated Prisma Client" into `prisma/generated/sqlite`.

- [ ] **Step 3: Add a `migrate:data` script to `package.json`**

In the `"scripts"` block, add:

```json
    "migrate:data": "tsx --env-file=.env scripts/migrate-sqlite-to-postgres.ts",
```

- [ ] **Step 4: Write the migration script**

Create `scripts/migrate-sqlite-to-postgres.ts`:

```ts
import { PrismaClient as PgClient, Prisma } from '@prisma/client'
import { PrismaClient as SqliteClient } from '../prisma/generated/sqlite'

const CHUNK = 1000
const pg = new PgClient()
const sqlite = new SqliteClient()

async function copyTable<R>(
  label: string,
  read: () => Promise<R[]>,
  write: (rows: R[]) => Promise<{ count: number }>,
  count: () => Promise<number>,
): Promise<void> {
  const existing = await count()
  if (existing > 0) {
    throw new Error(
      `Destination "${label}" already has ${existing} rows. Aborting to avoid duplicate import.`,
    )
  }
  const rows = await read()
  for (let i = 0; i < rows.length; i += CHUNK) {
    await write(rows.slice(i, i + CHUNK))
  }
  const dst = await count()
  if (dst !== rows.length) {
    throw new Error(`Row-count mismatch for "${label}": source ${rows.length}, destination ${dst}`)
  }
  console.log(`✓ ${label}: ${rows.length} rows`)
}

async function main() {
  // FK-safe order: parents before children.
  // 1. No parents
  await copyTable('user', () => sqlite.user.findMany(), r => pg.user.createMany({ data: r as Prisma.UserCreateManyInput[] }), () => pg.user.count())
  await copyTable('verification', () => sqlite.verification.findMany(), r => pg.verification.createMany({ data: r as Prisma.VerificationCreateManyInput[] }), () => pg.verification.count())
  await copyTable('apicHost', () => sqlite.apicHost.findMany(), r => pg.apicHost.createMany({ data: r as Prisma.ApicHostCreateManyInput[] }), () => pg.apicHost.count())
  // 2. -> user
  await copyTable('session', () => sqlite.session.findMany(), r => pg.session.createMany({ data: r as Prisma.SessionCreateManyInput[] }), () => pg.session.count())
  await copyTable('account', () => sqlite.account.findMany(), r => pg.account.createMany({ data: r as Prisma.AccountCreateManyInput[] }), () => pg.account.count())
  // 3. -> apicHost
  await copyTable('endpoint', () => sqlite.endpoint.findMany(), r => pg.endpoint.createMany({ data: r as Prisma.EndpointCreateManyInput[] }), () => pg.endpoint.count())
  await copyTable('interfaceSnapshot', () => sqlite.interfaceSnapshot.findMany(), r => pg.interfaceSnapshot.createMany({ data: r as Prisma.InterfaceSnapshotCreateManyInput[] }), () => pg.interfaceSnapshot.count())
  await copyTable('faultSnapshot', () => sqlite.faultSnapshot.findMany(), r => pg.faultSnapshot.createMany({ data: r as Prisma.FaultSnapshotCreateManyInput[] }), () => pg.faultSnapshot.count())
  await copyTable('faultCountSample', () => sqlite.faultCountSample.findMany(), r => pg.faultCountSample.createMany({ data: r as Prisma.FaultCountSampleCreateManyInput[] }), () => pg.faultCountSample.count())
  await copyTable('healthScoreSnapshot', () => sqlite.healthScoreSnapshot.findMany(), r => pg.healthScoreSnapshot.createMany({ data: r as Prisma.HealthScoreSnapshotCreateManyInput[] }), () => pg.healthScoreSnapshot.count())
  await copyTable('healthScoreSample', () => sqlite.healthScoreSample.findMany(), r => pg.healthScoreSample.createMany({ data: r as Prisma.HealthScoreSampleCreateManyInput[] }), () => pg.healthScoreSample.count())
  await copyTable('nodeSnapshot', () => sqlite.nodeSnapshot.findMany(), r => pg.nodeSnapshot.createMany({ data: r as Prisma.NodeSnapshotCreateManyInput[] }), () => pg.nodeSnapshot.count())
  await copyTable('hardwareComponent', () => sqlite.hardwareComponent.findMany(), r => pg.hardwareComponent.createMany({ data: r as Prisma.HardwareComponentCreateManyInput[] }), () => pg.hardwareComponent.count())
  await copyTable('nodeStatusSample', () => sqlite.nodeStatusSample.findMany(), r => pg.nodeStatusSample.createMany({ data: r as Prisma.NodeStatusSampleCreateManyInput[] }), () => pg.nodeStatusSample.count())
  // 4. -> interfaceSnapshot
  await copyTable('interfaceSample', () => sqlite.interfaceSample.findMany(), r => pg.interfaceSample.createMany({ data: r as Prisma.InterfaceSampleCreateManyInput[] }), () => pg.interfaceSample.count())
  // 5. standalone
  await copyTable('auditLog', () => sqlite.auditLog.findMany(), r => pg.auditLog.createMany({ data: r as Prisma.AuditLogCreateManyInput[] }), () => pg.auditLog.count())

  console.log('Migration complete.')
}

main()
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await pg.$disconnect()
    await sqlite.$disconnect()
  })
```

Note: the `as Prisma.*CreateManyInput[]` casts bridge the two generated clients' separate type namespaces (the runtime shapes are identical). `BigInt` columns pass through as `bigint`; `AuditLog.payload` JSON values pass through (a `null` payload becomes SQL NULL).

- [ ] **Step 5: Run the migration and verify counts**

Run: `bun run migrate:data`
Expected: one `✓ <table>: <n> rows` line per table and `Migration complete.`, with no row-count-mismatch errors. If any table aborts as "already has N rows", the destination wasn't empty — investigate before re-running (the script is safe: it refuses to double-import).

- [ ] **Step 6: Spot-check in Postgres**

Run: `docker compose exec postgres psql -U netroku -d netroku -c "SELECT count(*) FROM endpoint;" -c "SELECT count(*) FROM \"apic_host\";"`
Expected: counts match what the script reported for `endpoint` and `apicHost`.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.sqlite.prisma scripts/migrate-sqlite-to-postgres.ts .gitignore package.json
git commit -m "feat(db): add sqlite->postgres data migration script"
```

---

### Task 5: README setup + rollback documentation

**Files:**

- Modify: `README.md` (add a database section)

**Interfaces:**

- Produces: documented setup (`docker compose up`, migrate, optional data import) and a rollback procedure.

- [ ] **Step 1: Read the current README to find the setup section**

Run: `sed -n '1,60p' README.md`
Locate where setup/getting-started instructions live so the new section fits the existing structure.

- [ ] **Step 2: Add a database section to `README.md`**

Insert (under the setup/getting-started area, matching surrounding heading style):

```markdown
## Database (Postgres via Docker)

The app uses Postgres. For local development:

1. Start Postgres: `docker compose up -d`
2. Ensure `.env` has `DATABASE_URL="postgresql://netroku:netroku@localhost:5432/netroku?schema=public"`
3. Apply the schema: `bun run db:setup` (migrate deploy + generate)

### Migrating legacy SQLite data (one-time)

If you have an old `prisma/dev.db` to import:

1. Generate the read-only SQLite client: `bunx prisma generate --schema=prisma/schema.sqlite.prisma`
2. Run the copy: `bun run migrate:data`

The script refuses to run if the destination tables are non-empty.

### Rollback to SQLite

`prisma/dev.db` is left untouched by the migration. To revert:

1. In `prisma/schema.prisma`, set `provider = "sqlite"`.
2. Set `DATABASE_URL="file:./dev.db"` in `.env`.
3. Restore the SQLite migrations from git history (or `git revert` the cutover commit).
4. `bun run prisma:generate`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document postgres setup, data migration, and sqlite rollback"
```

---

## Post-plan manual verification (human)

These cannot be done by an automated subagent — run them after the plan completes:

1. **App boots on Postgres:** `bun run dev`, log in, load the dashboard — counts match pre-migration values.
2. **Case-insensitive search:** on the Endpoints page, search an upper-cased fragment of a known lower-case MAC (e.g. `AA:BB`) — it must still match. Repeat on Faults / Nodes / Health Scores / Interface Health.
3. **Resync works end-to-end:** trigger an endpoint resync against a host and confirm it succeeds and the lock releases (a second immediate resync is rejected with 409, then succeeds once the first finishes).

```

```
