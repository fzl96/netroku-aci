# Netroku ACI codebase context

## TL;DR

Netroku ACI is a Next.js 16 application for Cisco Application Centric Infrastructure (ACI) monitoring, bulk configuration workflows, scheduled synchronization, legacy network monitoring, and physical inventory.

The target architecture uses vertical purpose slices. Synchronous `page.tsx` adapters render stable shells, purpose-owned Server Components stream independent data regions through `Suspense`, and server-only modules under `src/lib/<purpose>/` own authorization, Prisma access, caching, mutations, and invalidation. No page or render component may access Prisma directly.

Start with this file, then open only the purpose directory involved in the task. For the active page-data migration, read:

- `docs/plans/2026-09-02-page-data-streaming-architecture-design.md`
- `docs/plans/2026-09-02-page-data-streaming-architecture.md`

These plan files are intentionally tracked even though `/docs` is ignored. Use `git add -f` when adding a new tracked plan there.

## Document status

This is the normative architecture for new work and the destination for the active refactor. It describes how the codebase should be organized, including slices that may still be migrating.

At the start of the migration, commit `cd490ab` contained the approved design and implementation plan. Endpoints is the first implementation slice. Check `git log`, `git status`, and, once created, `src/lib/page-architecture.test.ts` before assuming a later slice is complete.

Update this file when a change affects a domain boundary, runtime flow, security rule, cache contract, directory convention, or deployment topology. Do not turn it into a change log.

## Product boundaries

The application has five product areas:

1. ACI monitoring reads synchronized snapshots for endpoints, endpoint groups (EPGs), interfaces, nodes, and hardware.
2. ACI workflows validate, deploy, and roll back bulk CSV configuration against an Application Policy Infrastructure Controller (APIC).
3. Legacy monitoring accepts complete snapshots from an external IOS/NX-OS collector and renders device, health, interface, and endpoint views.
4. Physical inventory manages sites, racks, devices, rack placement, and device stacks.
5. Administration manages APIC hosts, synchronization schedules, users, audit history, and application settings.

The public landing page and Fumadocs documentation are outside the authenticated application shell.

## System topology

```text
Browser
  |
  +-- Next.js App Router
  |     +-- synchronous route adapters in src/app/
  |     +-- Server Components in src/components/<purpose>/
  |     +-- client interaction components in the same purpose folder
  |     +-- route handlers in src/app/api/
  |
  +-- Better Auth session

Server-only purpose modules in src/lib/<purpose>/
  |
  +-- PostgreSQL through Prisma
  +-- APIC over HTTPS for monitoring resync and configuration workflows
  +-- audit recording
  +-- tagged Next.js data cache

External writers
  |
  +-- scheduler container -> POST /api/cron/tick
  +-- optional scheduler client -> POST /api/cron/resync
  +-- netroku-cli collector -> POST /api/ingest/legacy/*
```

PostgreSQL is the durable source for locally rendered state. APIC remains authoritative for synchronized ACI state and deployed ACI configuration. The legacy collector remains authoritative for each complete legacy feature snapshot.

## Target request and rendering flow

### Route adapters

Every migrated `page.tsx` is a synchronous framework adapter. It may own metadata, normalize framework props through a purpose parser, and render one purpose view.

```tsx
export default function Page({ searchParams }: PageProps<'/endpoints'>) {
  const pageParams = searchParams.then(parseEndpointPageParams)
  return <EndpointsView pageParams={pageParams} />
}
```

The adapter must not:

- be `async`
- read a session
- import Prisma
- import broad modules from `src/actions/`
- query or mutate durable state
- contain substantial presentation code
- await `searchParams` or `params`

Map raw framework props to a domain type once. Pass a promise such as `Promise<EndpointPageParams>` to the view so framework prop shapes do not leak into purpose components.

### Stable shells and Suspense

The purpose view renders the page title, description, and stable layout immediately. It wraps independently useful data regions in separate `Suspense` boundaries.

Good region boundaries include:

- overview metrics and resync controls
- filter metadata
- paginated or alternate-view results
- trend charts
- attention or health panels
- detail panels with their own prerequisites

Do not create one boundary per database call. Keep prerequisite reads sequential, and stream regions only when they can succeed, fail, and render independently.

Each fallback must match the size and structure of the resolved region. Skeletons live beside their purpose render modules and include an accessible busy label. Expected read failures render a safe local error with retry while other regions stay usable.

Do not add per-page `loading.tsx` files. Regional Suspense preserves the stable shell and gives each data region an accurate fallback. Dashboard's old route-wide loading file is removed during its migration.

### Shared promises

Share prerequisite work within one request. A search-driven monitoring page typically has:

1. one normalized page-parameter promise
2. one request-cached host-resolution promise
3. independent overview and results reads after host resolution

Do not parse URL state once per region. Do not repeat authentication or selected-host resolution when React request caching can safely deduplicate it.

## Target purpose-slice structure

Use the page or business purpose as the primary boundary.

```text
src/app/(app)/endpoints/
  page.tsx

src/components/endpoints/
  endpoints-view.tsx
  endpoint-overview.tsx
  endpoint-results.tsx
  endpoints-skeleton.tsx
  endpoint-region-error.tsx
  endpoints-client.tsx
  export-endpoints-dialog.tsx
  port-detail-panel.tsx

src/lib/endpoints/
  params.ts
  query.ts
  mutation.ts
  export.ts
  sort.ts
  *.test.ts

src/app/api/endpoints/
  export/route.ts
  resync/route.ts
```

Create only the files a purpose earns:

| File                  | Responsibility                                                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `params.ts`           | Pure URL parsing, normalization, and canonical URL construction                                      |
| `query.ts`            | Server-only authorization, cached reads, Prisma orchestration, serialization, and safe return shapes |
| `mutation.ts`         | Server-only durable writes, audit behavior, and cache invalidation                                   |
| `actions.ts`          | Browser-invoked Server Action adapters only                                                          |
| `export.ts`           | Purpose-owned export selection or document construction when export exists                           |
| `sort.ts` and similar | Pure purpose behavior that does not belong in a render component                                     |

A purpose without browser-invoked Server Actions does not need `actions.ts`. A read-only purpose does not need `mutation.ts`. Manual resync, scheduled resync, legacy ingestion, inventory edits, and changes deployed to APIC all count as mutations because they change durable state or an external system.

Route handlers are transport adapters. They may parse requests, validate transport payloads, call a purpose interface, and translate results to HTTP responses. They must not import Prisma or reproduce business rules.

## Directory ownership and naming

### `src/app/`

Keep only Next.js framework files in migrated route directories, such as `page.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, and justified route files. Do not colocate ordinary clients, render helpers, sort utilities, or tests there.

### `src/components/`

Place rendering under `src/components/<purpose>/`. Keep a component at the narrowest common purpose boundary that serves all of its real consumers:

- shared by `/endpoints` descendants: `src/components/endpoints/`
- shared by inventory devices and racks: `src/components/inventory/`
- shared by legacy pages: `src/components/legacy/`
- shared by unrelated top-level purposes: `src/components/`

Reserve `src/components/ui/` for shadcn primitives. Do not add application-specific components there.

Use kebab-case filenames for new or moved non-framework files. Keep exported React component names in PascalCase. Existing files migrate to this convention when their vertical slice moves.

### `src/lib/`

Purpose modules own data and business behavior. Infrastructure that genuinely serves multiple purposes may remain in cross-cutting directories:

- `src/lib/apic/` for APIC protocol clients and low-level synchronization mechanics
- `src/lib/auth.ts` for Better Auth configuration and reusable secure guards
- `src/lib/prisma.ts` for the Prisma singleton
- `src/lib/audit.ts` for audit persistence
- `src/lib/crypto.ts` for encrypted schedule credentials
- `src/lib/schemas/` for shared transport and form schemas

Do not create shallow pass-through layers. A purpose interface should hide Prisma records, joins, cache mechanics, and authorization behind safe page-oriented shapes.

### `src/actions/`

The target architecture removes broad mixed read/write action modules. Browser-callable actions move to `src/lib/<purpose>/actions.ts`; durable implementations live in `mutation.ts`; page reads live in `query.ts`.

Delete obsolete action paths after all callers move. Do not retain duplicate seams for compatibility unless an external contract requires them.

## Authentication and authorization

Better Auth provides username/password sessions and two roles: `admin` and `member`.

Authorization follows a hybrid model:

- shared layout checks support navigation and optimistic shell behavior
- every purpose query verifies a session before reading protected data
- every mutation verifies the required session and role before changing state
- every Server Action and route handler authorizes independently
- request-scoped `cache()` may deduplicate session lookup
- persistent caches never include sessions or authorization decisions

Use reusable `requireSession()` and `requireAdmin()` guards from `src/lib/auth.ts`. Authorize before calling a persistent cached function. Never read cookies, headers, or sessions inside `unstable_cache`.

Access expectations:

| Area                            | Expected access                             |
| ------------------------------- | ------------------------------------------- |
| Landing page, docs, docs search | Public                                      |
| Monitoring and audit history    | Authenticated user                          |
| ACI CSV workflows               | Authenticated user                          |
| APIC hosts, scheduler, users    | Admin                                       |
| Inventory reads                 | Authenticated user                          |
| Inventory writes and imports    | Admin                                       |
| `/api/cron/*`                   | `SCHEDULER_TOKEN` bearer authentication     |
| `/api/ingest/legacy/*`          | `LEGACY_INGEST_TOKEN` bearer authentication |

`src/proxy.ts` redirects unauthenticated browser requests, but proxy coverage is not a substitute for authorization near data or side effects. Cron routes are excluded from session proxying and must verify their bearer token. Legacy ingestion routes are public only at the session layer and must verify their dedicated machine token.

## Cache and freshness contract

The project does not enable global Cache Components. Use scoped `unstable_cache` around expensive, shareable Prisma reads.

### Cache rules

- authorize before entering a persistent cache
- use normalized, stable values in cache keys
- return serialized, purpose-safe data rather than Prisma records
- default synchronized monitoring reads to an eight-hour safety lifetime, `28_800` seconds
- keep explicitly live behavior uncached, such as Scheduler background polling
- keep Legacy health/interface drawer histories uncached: they are on-demand,
  high-cardinality time-series reads where always-fresh data is more useful than
  caching every entity/range/page combination
- never cache secrets, session objects, user-specific authorization, request headers, or cookies

### Tag hierarchy

Use purpose-wide, host-specific, and entity tags when each level has consumers:

```text
endpoints:all
endpoints:host:<apicHostId>

interfaces:all
interfaces:host:<apicHostId>

nodes:all
nodes:host:<apicHostId>

epgs:all
epgs:host:<apicHostId>

inventory:all
```

Inventory deliberately uses one purpose-wide tag. Its sites, racks, and devices
embed each other's display fields, and its writes are infrequent; broad expiry is
safer than maintaining a cross-entity invalidation matrix. Introduce narrower
tags only when measured cache churn makes that additional interface worthwhile.

Dashboard regions use the tags of the datasets they consume. An endpoint resync must evict endpoint-dependent Dashboard data without evicting unrelated interface or node regions.

### Invalidation rules

Expire affected tags immediately after a durable write commits:

```ts
revalidateTag('endpoints:all', { expire: 0 })
revalidateTag(`endpoints:host:${hostId}`, { expire: 0 })
```

Manual and scheduled writers call the same invalidation implementation. Failed writes keep the last valid cache. A partial multi-dataset resync invalidates only the datasets that changed successfully.

Exports should use the same purpose query boundary as screens, including authentication and host validation. Avoid a second Prisma query implementation in an export route.

## Operational data flows

### ACI monitoring synchronization

An authenticated user can manually resync one dataset through its POST route. The request provides an APIC host ID and ephemeral APIC credentials. The application does not persist those manual credentials.

The server resolves the configured host, signs in to APIC, fetches and parses the dataset, commits the local snapshot, records an audit entry, and invalidates the purpose cache. Low-level protocol and reconciliation logic remains under `src/lib/apic/`; the purpose mutation owns orchestration and invalidation.

The four scheduled datasets are:

- endpoints
- interfaces and counter samples
- nodes, hardware components, and node-status samples
- EPGs and static path bindings

### Scheduled resync

Each APIC host can have one `ResyncSchedule`. Credentials are encrypted with `ENCRYPTION_KEY`. The default interval is 480 minutes, the allowed range is 15 to 10,080 minutes, and a claim becomes stale after 120 minutes.

The scheduler container calls `POST /api/cron/tick` every 60 seconds. One tick atomically claims the most-overdue schedule with `FOR UPDATE SKIP LOCKED`, processes at most 20 schedules, and finalizes each deadline from completion time. This prevents overlapping ticker instances from running the same active claim.

`src/lib/apic/resync-host.ts` is the low-level all-dataset coordinator. In the target architecture, it enters each purpose through a trusted mutation interface so scheduled and manual writes share invalidation behavior.

`POST /api/cron/resync` is a separate bearer-authenticated ad hoc endpoint that accepts host IDs and credentials in its request. Do not confuse it with the stored-schedule ticker.

### Legacy ingestion

The Next.js application never opens SSH connections to legacy devices and never stores their credentials. The standalone `netroku-cli` collector posts complete feature snapshots to:

- `POST /api/ingest/legacy/health`
- `POST /api/ingest/legacy/interfaces`
- `POST /api/ingest/legacy/endpoints`

Every request uses `Authorization: Bearer <LEGACY_INGEST_TOKEN>`. Idempotency is scoped by run ID, device, and feature. Reusing an idempotency key with different content returns a conflict.

Only complete collections are submitted. Missing interfaces in a completed interface snapshot become not present. Missing endpoints become inactive and retain history. Successful ingestion invalidates only the affected legacy purpose tags.

The legacy interface list sorts matched snapshots in memory to preserve natural
ordering. Snapshot-field and CRC-window-total sorts fetch latest samples only
for the visible page; latest-counter and collection-time sorts fetch samples for
all matches before paging. Latest samples use a lateral indexed lookup. The full
matched list is uncached because fleet-sized entries exceed the data cache limit;
summary and filter metadata remain cached.

### ACI configuration workflows

The CSV workflows connect to APIC, validate rows, deploy configuration, roll it back, and write audit results. Validation uses bounded parallelism and request-local APIC read deduplication.

These workflows remain outside the page-data migration for now:

- `bridge-domains/**`
- `bridge-domains/epgs/**`
- `static-ports/**`
- `interface-selectors/**`

Do not move or re-architect these routes as collateral work. They remain under their established route/component and `src/lib/apic/` seams until separately approved.

### Physical inventory

Inventory is user-managed durable state. Reads belong in inventory purpose queries. CRUD, rack placement, resizing, stack changes, and imports belong in mutations. Browser forms call narrow actions.

Preserve these invariants:

- a device serial number is unique
- a non-null asset tag is unique
- rack placement stays within rack height
- devices in the same rack cannot occupy overlapping units
- a device stack has at most one master
- when a master leaves, select a replacement deterministically
- stack edits serialize against concurrent master selection
- bulk import validates and plans before execution

Shared inventory render modules belong under `src/components/inventory/`, with narrower devices, racks, sites, and import directories where appropriate.

## Domain model

`prisma/schema.prisma` is the authoritative schema. Prisma migrations under `prisma/migrations/` are the production history.

### Authentication and audit

| Aggregate                                    | Meaning                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| `User`, `Session`, `Account`, `Verification` | Better Auth persistence                                                             |
| `AuditLog`                                   | Actor, action, target, status, detail, and optional payload for operational changes |

`AuditLog.userId` is intentionally loose rather than a Prisma relation, so history can survive actor deletion and machine actors can use `null`. `recordAudit()` logs failures but does not fail the primary operation.

### ACI monitoring

| Aggregate           | Key semantics                                                                      |
| ------------------- | ---------------------------------------------------------------------------------- |
| `ApicHost`          | Configured APIC identity and last-sync timestamps                                  |
| `ResyncSchedule`    | One optional encrypted schedule per APIC host                                      |
| `Endpoint`          | Placement history; active rows remain current and cleared rows remain historical   |
| `InterfaceSnapshot` | Current interface identity and latest state, unique by host and distinguished name |
| `InterfaceSample`   | Time-series counters and computed deltas                                           |
| `NodeSnapshot`      | Current or no-longer-present fabric nodes                                          |
| `HardwareComponent` | Current or no-longer-present PSU and fan inventory                                 |
| `NodeStatusSample`  | Time-series aggregate node and component health                                    |
| `EpgSnapshot`       | Latest EPG metadata, unique by host and distinguished name                         |
| `EpgPathBinding`    | Static path bindings owned by an EPG snapshot                                      |

Deleting an `ApicHost` cascades through its related monitoring aggregates and schedule.

Endpoint resync preserves movement history. It bumps unchanged rows, relabels description-only changes, clears moved or missing rows, and inserts a new active row for a new placement. Per-host endpoint and EPG resyncs use distinct PostgreSQL advisory transaction locks.

EPG resync replaces the host's EPGs and bindings atomically. Node resync upserts records and marks missing nodes or components not present. Interface resync upserts snapshots and appends counter samples with deltas.

### Legacy monitoring

| Aggregate                 | Key semantics                                                |
| ------------------------- | ------------------------------------------------------------ |
| `LegacyDevice`            | Normalized site and hostname identity plus feature freshness |
| `LegacyIngestReceipt`     | Idempotency and counts for one run, device, and feature      |
| `LegacyHealthSample`      | Health snapshot associated one-to-one with its receipt       |
| `LegacyLogEntry`          | Deduplicated log history                                     |
| `LegacyInterfaceSnapshot` | Current/past interface presence and identity                 |
| `LegacyInterfaceSample`   | State and error-counter time series                          |
| `LegacyEndpoint`          | Active and historical learned endpoint placement             |

Legacy device identity uses normalized `siteKey` and `hostnameKey`. Interface identity uses `ifNameKey`; endpoint reconciliation uses normalized IP and interface keys.

### Physical inventory

```text
Site 1 -> many Rack 1 -> many Device
Device many -> optional DeviceStack
```

`DeviceStack` membership is optional. Deleting a stack sets device stack references to null. Device status is `ACTIVE`, `PLANNED`, `RETIRED`, or `MAINTENANCE`; stack role is `MASTER` or `MEMBER`.

## Route and purpose map

| Purpose            | Browser routes               | Primary target modules                                          |
| ------------------ | ---------------------------- | --------------------------------------------------------------- |
| Dashboard          | `/dashboard`                 | `src/components/dashboard/`, `src/lib/dashboard/`               |
| APIC hosts         | `/apic-hosts`                | `src/components/apic-hosts/`, `src/lib/apic-hosts/`             |
| Endpoints          | `/endpoints`                 | `src/components/endpoints/`, `src/lib/endpoints/`               |
| EPG inventory      | `/epgs`                      | `src/components/epgs/`, `src/lib/epgs/`                         |
| Interface health   | `/interface-health`          | `src/components/interface-health/`, `src/lib/interface-health/` |
| Nodes and hardware | `/nodes`                     | `src/components/nodes/`, `src/lib/nodes/`                       |
| Legacy monitoring  | `/legacy/*`                  | `src/components/legacy/`, `src/lib/legacy/`                     |
| Inventory          | `/inventory/*`               | `src/components/inventory/`, `src/lib/inventory/`               |
| Scheduler          | `/scheduler`                 | `src/components/scheduler/`, `src/lib/scheduler/`               |
| Audit history      | `/history`                   | `src/components/history/`, `src/lib/history/`                   |
| Users              | `/users`                     | `src/components/users/`, `src/lib/users/`                       |
| Settings           | `/settings`                  | `src/components/settings/`, `src/lib/settings/` as earned       |
| ACI workflows      | workflow routes listed above | existing workflow components and `src/lib/apic/`                |
| Documentation      | `/docs/*`                    | `content/docs/`, `src/components/docs/`, `src/lib/source.ts`    |

The navigation shell switches between ACI and legacy scopes using the `netroku_scope` cookie. Scope routing rules live in `src/lib/navigation-scope.ts`. Shared pages such as Dashboard, Docs, History, Settings, and Users preserve the selected scope.

## APIC connectivity and secrets

`src/lib/apic/client.ts` accepts only plain hostnames or IP addresses with an optional port. It creates HTTPS requests directly and disables certificate verification because APIC commonly uses self-signed certificates in internal networks. Do not broaden the accepted host format without an explicit server-side request-forgery review.

Credential rules:

- manual APIC credentials are request-scoped and never stored
- scheduled APIC credentials are encrypted at rest
- changing `ENCRYPTION_KEY` makes stored schedule credentials unreadable
- APIC session tokens stay transient
- legacy device credentials remain only in the external collector
- `.env*`, private inventories, certificates, tokens, and collector runtime files must not enter source control

## Environment variables

| Variable                           | Purpose                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `DATABASE_URL`                     | PostgreSQL connection string                             |
| `BETTER_AUTH_SECRET`               | Better Auth signing secret                               |
| `BETTER_AUTH_URL`                  | Server base URL for Better Auth                          |
| `NEXT_PUBLIC_APP_URL`              | Browser-visible application URL                          |
| `TRUSTED_ORIGINS`                  | Comma-separated Better Auth origins                      |
| `SECURE_COOKIES`                   | Set to `true` only for HTTPS-only serving                |
| `ENCRYPTION_KEY`                   | 32-byte hex key for schedule credentials                 |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Initial admin seed credentials                           |
| `SCHEDULER_TOKEN`                  | Bearer token for `/api/cron/tick` and `/api/cron/resync` |
| `LEGACY_INGEST_TOKEN`              | Bearer token for `/api/ingest/legacy/*`                  |

Use `.env.example` as the setup template. Never invent fallback secrets in application code.

## Runtime and deployment

The stack uses:

- Bun 1.1 or newer for local scripts and tests
- Next.js 16.2 with the App Router
- React 19.2 and the React Compiler
- Prisma 6 with PostgreSQL 17
- Better Auth
- Tailwind CSS 4 and shadcn components
- Fumadocs for public documentation

`next.config.ts` enables the React Compiler and standalone output. It does not enable Cache Components.

Docker Compose runs four services:

- `db`: PostgreSQL
- `migrate`: applies Prisma migrations before the app starts
- `app`: standalone Next.js server on port 3000
- `scheduler`: calls the ticker once per minute

A push to `main` triggers `.github/workflows/deploy.yml`, connects through Tailscale, and invokes `/home/netroku/deploy.sh` on the deployment host.

## Development commands

```bash
bun install
docker compose up -d db
bun run db:setup
bun run seed:admin
bun run dev
```

Verification commands:

```bash
bun test path/to/focused.test.ts
bun test
bun run lint
bun run build
git diff --check
```

Prisma commands:

```bash
bun run prisma:generate
bun run prisma:migrate
bun run prisma:deploy
bun run prisma:studio
```

Use `bun run migrate:data` only for the guarded one-time SQLite-to-PostgreSQL import. It refuses to copy into non-empty destination tables.

## Testing and migration guardrails

Tests use Bun and stay beside the modules they verify. Preserve pure behavior tests, but test important behavior through the deep purpose interface as well.

Each migrated slice must cover:

- authentication and role enforcement
- parameter normalization and canonical URLs
- filtering, sorting, pagination, and alternate views
- Prisma orchestration through the purpose interface
- serialized safe return shapes
- cache keys, tags, and eight-hour lifetime
- invalidation after successful and partial writes
- Suspense composition and shape-matched skeletons
- safe regional failures and retry behavior

The implementation plan creates `src/lib/page-architecture.test.ts` as the migration guard. Add one purpose at a time, make the guard fail against the old structure, and bring it back to green within the same vertical slice.

For every migrated purpose, the guard should enforce:

- pages do not import Prisma, actions, or session reads
- render modules do not import Prisma
- export, resync, ingestion, scheduler, and action entry points do not import Prisma
- route directories contain framework files only
- no page-level `loading.tsx`
- excluded ACI workflows remain outside the guard

Do not introduce a public database adapter only for tests. Use module substitution or narrow internal seams while keeping the production interface deep.

## Refactor sequence

Implement the approved architecture as working vertical slices:

1. Endpoints
2. EPGs
3. Interface Health
4. Nodes and hardware
5. Dashboard
6. Legacy monitoring and ingestion invalidation
7. Inventory
8. APIC Hosts, Scheduler, Users, History, Settings, and remaining session-only pages
9. Final architecture sweep

Each slice includes parameters, queries, mutations when earned, transport adapters, render modules, skeletons, local errors, tests, focused linting, a production build, and review. Delete obsolete paths before moving to the next slice.

## How to approach common tasks

### Change a monitoring page

Open its route adapter, `src/components/<purpose>/`, and `src/lib/<purpose>/`. Change the page only if framework adaptation changes. Put data selection and safe shapes in `query.ts`, side effects in `mutation.ts`, and presentation in components.

### Change synchronization behavior

Start at the purpose mutation boundary, then follow the low-level implementation under `src/lib/apic/`. Preserve audit recording, transactional reconciliation, concurrency protection, and tag invalidation. Verify manual and scheduled entry points.

### Add a filter or URL option

Normalize it in `params.ts`, add it to the purpose query input, update canonical URL construction, and share the single parsed promise across regions. Test invalid, repeated, and missing values.

### Add a browser mutation

Implement the durable operation in `mutation.ts`. Expose a narrow `'use server'` adapter in `actions.ts` only if a client component calls it. Authorize in the durable boundary and return a safe result union.

### Add an export

Validate the transport request in the route, use the authenticated purpose query for data selection, build the file in `export.ts`, and create the HTTP response in the route. Do not query Prisma in the export route.

### Add a shared component

Keep it purpose-local until real consumers require promotion. Promote it to the nearest common purpose ancestor, not automatically to the root. Keep `components/ui/` shadcn-only.

### Investigate code relationships

When the code-review graph tools are available, use them before filesystem-wide searches, as described in `CLAUDE.md`. Otherwise start from this route-purpose map and use targeted `rg` queries. Avoid rescanning the whole repository when the purpose boundary is known.

## Non-negotiable invariants

- Pages are synchronous adapters, not data loaders.
- Server Components fetch through purpose queries, never Prisma.
- Prisma stays behind server-only purpose or infrastructure modules.
- Authorization occurs close to every protected read or write.
- Persistent caches contain no request or session state.
- Every successful durable write invalidates its affected tags.
- Scheduled and manual synchronization share mutation and invalidation semantics.
- Stable shells render before data regions.
- Suspense boundaries follow visual and failure independence.
- Regional skeletons match resolved content.
- Migrated app route directories contain framework files only.
- New and moved non-framework filenames use kebab-case.
- `components/ui/` remains reserved for shadcn.
- Excluded ACI workflows do not change during the page-data migration.
- Secrets and network-device credentials never enter the repository.
