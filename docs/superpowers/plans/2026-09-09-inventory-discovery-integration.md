# Inventory discovery integration — implementation plan

Date: 2026-09-09
Status: Implemented in workspace; deployment and user UI review pending (2026-09-10)
Specification: [design](../specs/2026-09-09-inventory-discovery-integration-design.md)

## Delivery approach

Implement the specification in the ordered steps below. Individual physical-device
adoption can ship as Milestone A once ownership enforcement, CSV protection,
durable reconciliation, and ACI run fencing are available together. Stack and
bulk adoption form Milestone B and remain in the user's full requested scope.
Until then, require explicit single-chassis confirmation for Legacy adoption and
leave the source unlinked if the user answers stack or unsure; this is an
attestation, not automatic detection. Manual stack inventory
and existing stack CSV creation continue to work. Schema migrations can land first because they leave existing
assets manual. Do not auto-link or backfill inventory assets during migration.

At implementation start, use the repository graph tools if available, then verify
implementations and relevant tests. Recheck AGENTS.md and working-tree changes.
The graph was unavailable during document preparation. Do not treat estimates or
prior discussion as evidence about production fleet data.

## 1. Establish contracts and migration

Primary files: `prisma/schema.prisma`, new `prisma/migrations/*`,
`src/lib/inventory/devices/query.ts`, `src/lib/schemas/device.ts`.

- Add nullable Device.version, stack observed fields, InventorySource enums,
  model, and all singular inverse relations from the specification.
- Add InventoryReconcileJob, source inventoryRevision fields, link acceptedRevision,
  Legacy per-field metadata ordering/conflict storage, and host lease token,
  generation, and expiry storage. Use Int revision counters and a string CUID job
  ID; keep revisions out of client DTOs and test JSON serialization. Add the
  singleton InventoryWorkerHealth record from the deployment-health contract.
  Define observation JSON validation explicitly.
- Add ordinary unique constraints and documented target/source CHECK constraints.
  Ensure SetNull source deletion remains legal under those checks. Add documented
  migration-managed pending-job partial indexes for due selection and predecessor
  lookup; keep completed rows out of the hot indexes.
- Keep name, serial, model, vendor, height, rack/site behavior, and existing data.
- Inspect `prisma/schema.sqlite.prisma` and
  `scripts/migrate-sqlite-to-postgres.ts` before touching them: the SQLite schema
  serves the historical data migration client, not automatically a second live
  deployment schema. Preserve historical migration compatibility.
- Extend safe DTOs and form schemas with optional version and source summary;
  avoid exposing source credentials or entire telemetry relations.
- Add normalized observation, source identity, field-presence, and conflict
  result types under a new `src/lib/inventory/sources/` directory.

Validation: generate Prisma client and apply migrations to a disposable PostgreSQL
database. Test legal physical/stack links, duplicate targets/sources, invalid
cross-kind references, missing targets, source SetNull, and preexisting manual
assets. Do not run destructive migration tests against a configured user database.

## 2. Build ownership, identity, and link operations

Primary files: new `src/lib/inventory/sources/{identity,ownership,mutation}.ts`,
`src/lib/inventory/devices/mutation.ts`, `src/lib/inventory/stack-master.ts`,
`src/lib/audit.ts`.

- Implement normalization, placeholder rejection, match suggestions, typed
  ownership errors, and explicit write allowlists. Different nonempty serials
  cannot be linked; absent serials require confirmed expected identity.
- Implement transactional adopt, link, unlink, relink, replacement review, and
  standalone-to-stack reassignment. Enforce admin authorization and audit.
- Establish and document shared target/source lock ordering before adding sync
  or CSV callers. Revalidate current ownership inside every write transaction.
- Protect directly linked fields in manual update paths, including disconnected
  links; preserve full manual editing when the association is explicitly removed.
- Add stack-target operations and observed-field ownership. Protect linked
  stacks from implicit deletion by last-member cleanup in every mutation path.

Validation: unit tests for normalization/ownership plus database tests for atomic
adoption, duplicate requests, simultaneous linking, serial mismatch, relinking,
unlinked manual editing, and linked-stack member deletion/movement.

## 3. Make CSV updates safe

Primary files: `src/lib/inventory/csv.ts`, `src/lib/inventory/import-planning.ts`,
`src/lib/inventory/import/mutation.ts`, import UI and template/export producers.

- Preserve field presence instead of turning omitted update values into defaults.
  Add version and metadata-only updates. Blank/absent update fields preserve
  values; clearing stays in the manual form. CSV clear syntax is deferred.
- Keep all creation validation and existing CSV aliases. Existing full CSV files
  remain accepted; blank update cells now preserve values, as documented.
- Resolve serial matches without choosing among normalized duplicates.
- Use shared ownership validation in preview and execution. Source-owned identical
  values pass; changes fail. Stack-source ownership does not lock member fields.
- Re-read and lock targets inside execution, including stack cleanup. Abort and
  request a fresh preview on new transactional conflicts; retain explicit
  valid/skipped-row reporting for preview-known row errors.
- Keep imports manual; no implicit discovery linking.

Relevant existing tests: `csv.test.ts`, `import-planning.test.ts`,
`import/mutation.test.ts`, and device import component tests.
Add cases for omitted/blank fields, linked-field conflicts, version,
metadata-only updates, three stack-member rows, and ownership changing between
preview and commit.

## 4. Fence source writes and integrate durable reconciliation

Primary files: new `src/lib/inventory/sources/{outbox,reconcile,worker}.ts`,
`src/lib/apic/nodes.ts`, `src/lib/nodes/mutation.ts`,
`src/lib/legacy-ingest/common.ts`, scheduler tick integration,
`src/lib/inventory/mutation.ts`, source deletion and cache paths.

- Fix the confirmed manual/scheduled ACI race with a shared per-host lease and
  fencing token, acquired before fetch and checked under lock before all node
  snapshot/presence/outbox writes. Cover renewal, expiry, takeover, conditional
  release, busy responses, and old-run rejection. The schedule-row claim alone
  is insufficient; do not hold a database transaction across network fetches.
- Fix duplicate Legacy receipt ordering before metadata upsert. Persist and
  enforce per-field collected-at ordering/conflict state even for unlinked
  sources. Keep receipt time separate and preserve omitted fields.
- Write a bounded immutable outbox projection alongside accepted source metadata
  or presence changes. Increment source revision atomically. Deduplicate identical
  metadata so health/interfaces/endpoints receipts do not each lock assets.
- Build a durable worker with source-head-only SKIP LOCKED claiming: NOT EXISTS
  must exclude any earlier incomplete revision even if locked or in backoff.
  Follow the exact query contract in the specification. Apply and acknowledge
  under the claim transaction. Preserve per-source revision ordering,
  bounded transactions, backoff/error visibility, retention, and restart recovery.
  Asset application, audit, processed revision, and acknowledgment commit together.
- Integrate a periodic drain into the existing scheduler tick independently of
  enabled APIC schedules, before/outside the schedule loop. Configure and verify
  SCHEDULER_TOKEN plus an actual periodic caller as a deployment dependency.
  Record empty-queue heartbeats; expose missing configuration, no heartbeat,
  overdue heartbeat, drain error, queue age/count, and retries. Follow the
  documented 20-minute configurable worker-health window, separate from Legacy
  device freshness. Add setup/service verification instructions and Legacy-only
  deployment tests. Isolate drain failures from APIC schedule execution. A post-commit
  drain is optional latency optimization, not the only recovery path.
- Initialize adoption/relink revision baselines from locked current sources; older
  jobs or deleted/recreated source identities cannot apply to a new association.
- Physical serial mismatch freezes technical writes and records a review outcome;
  logical-stack reported serial changes never rewrite member identity.
- Derive missing/disconnected display from rows/FKs and expose reconciliation
  pending/failure separately. Source deletion preserves key/label and invalidates
  inventory caches. Worker application invalidates after its own commit.

Relevant tests: `src/lib/apic/nodes.test.ts`, node mutation tests,
`src/lib/legacy-ingest/common.test.ts`, feature ingest tests, scheduler tests,
plus new real-database queue/lease tests.

Validate duplicate/delayed/equal-time/partial Legacy metadata, every feature path,
ACI disappearance/reappearance, source deletion, replacement conflicts, adoption
while work is pending, relink while a worker runs, worker rollback/restart,
poison-job backoff blocking later revisions while other sources progress,
concurrent worker claims, and manual versus
scheduled fetch races. Inject inventory timeout/audit failure and prove committed
telemetry remains intact. Measure large-fabric enqueue overhead and bounded worker
batch time; do not increase the telemetry timeout to accommodate inventory work.

## 5. Add discovery reads and actions

New area: `src/lib/inventory/sources/` query/params/actions; new route
`src/app/(app)/inventory/discovered/page.tsx`.

- Paginate/filter persisted NodeSnapshot and LegacyDevice observations with
  source-scoped identity. Exclude component serial matching.
- Return link target, observed fields, readable provenance, match suggestions,
  last received/seen time, ACI presence, and conflict independently.
- Use existing authenticated read/admin mutation conventions and inventory cache
  patterns. Bound searches and bulk batch sizes; avoid per-row query fan-out.
- Add individual adoption/link actions in Milestone A and bulk actions in
  Milestone B with per-row outcomes and
  idempotent handling of already-linked requests.
- Do not make APIC network calls from page rendering.

Validation: query tests for source filtering, pagination, collisions, missing
serials, disconnected historical identity reservations, existing target links,
and viewer/admin permissions.

## 6. Build user workflows and documentation

Deliver individual physical workflows for Milestone A. Deliver stack adoption,
conversion, and bulk review for Milestone B; they remain full-scope requirements,
not prerequisites for the earlier safe physical-only milestone.

Primary areas: new inventory discovery components; existing device form, detail,
list, import client, navigation, and stack controls.

- Add Discovered devices navigation and Add device → Manual affordance.
- Build individual/bulk review with prefills, required missing fields, explicit
  defaults, match confirmation, and honest per-row results.
- Add Legacy Adopt as Stack: select/create group, add existing/manual members,
  display observed logical details separately from physical member identity.
- Show source-owned fields as read-only and explain editable manual fields.
  Include source label, last observation, missing/disconnected state, conflict
  review, unlink/relink, and accepted version on details.
- Surface linked-stack cleanup errors with the required explicit unlink action.
- Update CSV template/help for version, patch semantics, manual-form clearing, stack rows,
  serial-key creation behavior, and post-import linking.
- Document the example of one Legacy node linked to three physical members.

Validation: focused component tests and browser verification of empty inventory,
ACI adoption, Legacy adoption, manual backup entry, CSV create/update, bulk partial
failure, three-member stack, serial conflict, source removal, and narrow layouts.

## 7. Release verification

- Run relevant Bun tests, repository lint, TypeScript checking, and production
  build using the repository's installed toolchain. Check formatting for changed
  files. Report environmental failures separately from regressions.
- Verify migration on both a fresh disposable database and one containing
  existing manual assets/racks/stacks. Never fabricate discovery links.
- Perform database concurrency tests for adoption, import versus link, manual
  edit versus reconciliation, and relink versus workers. Verify queue recovery
  without UI visits, scheduled/manual fencing, and Legacy-only worker operation.
  Test absent token, token without a caller, stopped caller, stale heartbeat,
  empty-queue heartbeat, and worker errors while APIC schedule processing proceeds.
- Confirm specification criteria 1–13 for Milestone A and 1–15 for full delivery
  with recorded results; stack and bulk workflows are Milestone B requirements.
- If representative fleet data is available, report counts of missing/placeholder
  serials and normalized duplicates separately for ACI and Legacy. This quantifies
  adoption effort; it does not silently change serial-required policy.
- Document deferred features. Do not label Legacy records stale without a
  configured policy or claim individually observed stack members from one record.

## Completion boundary

Both milestone workflows are implemented: schema/migration, protected writes and
CSV patch updates, durable reconciliation, ACI fencing, discovery review, bulk
linking, and logical-stack adoption/conversion. Deployment to the user's configured
database has not been performed. Browser/visual checks are explicitly delegated to
the user at their request; automated database and application checks remain here.

## Implementation verification (2026-09-10)

- 183 focused tests across Inventory, Legacy ingest, node/host mutations, and history.
- 11 dedicated PostgreSQL integration tests: migration constraints, source deletion,
  delayed/replayed metadata, protected CSV, ordered retries/concurrent workers,
  physical stacks, fenced leases, concurrent adoption/review tokens, audit-failure
  isolation, worker health, recreated-source relinking, and empty-schedule ticks. A 500-node resync with durable outbox completed in
  243 ms locally against the 30-second transaction budget; this is a local
  database measurement, not a production latency guarantee.
- Reproducible upgrade check preserves every original column on 500 assets and
  initializes existing Legacy ordering clocks without rewriting observations.
- Prisma validation and production build pass. Repository lint has no errors
  (five warnings in unchanged files). Standalone tsc still reports existing
  test-file diagnostics also reproduced in a baseline checkout.
- User performs browser checks. See [operations](../../inventory-discovery-operations.md)
  for migration and worker setup, CSV behavior, and suggested manual checks.

The implementation uses a shared transaction advisory lock for inventory asset
and source writes, keeping locking order simple across multi-member/CSV operations.
Ingestion never acquires it. Discovery target lists are bounded with search and
additional exact serial matches. Review tokens exclude receipt freshness and
reject material source changes before adoption. Migration seeds conservative
Legacy metadata clocks so the first delayed post-upgrade payload cannot overwrite
preexisting technical values.
