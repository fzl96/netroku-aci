# Inventory discovery integration — specification

Date: 2026-09-09
Status: Implemented in workspace; user UI review and deployment pending (2026-09-10)
Implementation plan: [inventory-discovery-integration](../plans/2026-09-09-inventory-discovery-integration.md)

## Purpose

Populate Inventory using the device information already collected from ACI and
Legacy. Preserve manual entry and CSV import for offline equipment, spares, and
other assets that have no discovery record. Automatically refresh accepted
technical information after an explicit adoption or link operation, without
overwriting user-managed asset information.

Inventory represents physical assets. Discovery can represent either a physical
device or a logical stack. These identities must not be conflated.

Revision: incorporates review of resync concurrency, transaction isolation, and
incremental delivery.

This document supersedes the alternative schema sketches discussed before it:
there is one source per target, no ACI-over-Legacy precedence, and a source may
target either a physical device or a logical stack.

## Current implementation and constraints

- `prisma/schema.prisma`: `Device` already holds name, unique required serial,
  vendor, model, required height, rack placement, status, IP, and stack membership.
  It has no version or discovery association. Site is derived through Rack.
- `NodeSnapshot` holds ACI name, serial, model, and version. Its identity is
  `(apicHostId, dn)`. `src/lib/apic/nodes.ts` marks vanished nodes `present: false`
  after successful discovery. Its component collector fetches PSUs and fans,
  not chassis identity records; component serials are excluded from matching.
- `LegacyDevice` holds hostname, nullable serial/model/software version, and
  receipt freshness. Its identity is `(siteKey, hostnameKey)`. The common ingest
  path sets `active: true`; neither milestone may interpret that flag as proof of freshness.
- `src/lib/legacy-ingest/common.ts` shares the device upsert across feature
  ingestion. It updates metadata before checking duplicate receipts today;
  inventory integration must explicitly prevent replay and ordering regressions.
- Scheduled resync claims a schedule row, but manual resync enters the same node
  writer without that claim (`src/app/api/nodes/resync/route.ts`,
  `src/lib/nodes/mutation.ts`, `src/lib/apic/schedule-claim.ts`). A shared host
  run-order guard is required. The node write transaction has a 30-second timeout;
  downstream inventory work must not extend that transaction.
- Device form mutations and CSV execution independently write device fields.
  CSV parsing currently collapses absent/blank fields and supplies defaults.
  Field-presence preservation is therefore a required implementation change.
- Rack placement requires numeric height. Existing stack rules enforce member
  numbering, a master, and shared management IP exceptions.

The graph MCP tools were unavailable during this specification's preparation;
these findings were checked in source. Fleet serial completeness has not been
measured against deployment data.

## Scope and defaults

The complete scope across Milestones A and B includes discovered-device browsing,
individual and bulk adoption/linking, manual assets, safe CSV updates, logical
stack linking, reconciliation, provenance, and source lifecycle display. Existing inventory records remain manual after
migration; no implicit migration-time adoption occurs. Existing Legacy fields
receive conservative per-field ordering baselines from the latest stored receipt
(or creation time) without changing their values.

Keep serial, vendor, model, name, and height required on physical devices. Missing
required information must be supplied during adoption. Keep Site derived from
Rack; independent Site assignment and unknown height are separate features.

Management IP and inventory lifecycle status remain user-managed in both milestones. IP and
Vendor may be seeded as editable suggestions. Discovery availability never
changes lifecycle status. An absent/offline asset remains in Inventory.

No automatic source selection, component inventory, automatic stack inference,
member enumeration, cadence inference, or history timeline is included.

## Delivery milestones

The full requested scope retains stacks and bulk adoption. These can follow a
smaller first milestone; they are not safety prerequisites for standalone adoption.

- Milestone A: individual physical-device adoption/linking, manual assets, CSV
  field-presence and ownership protection, durable reconciliation, provenance,
  identity conflicts, and shared ACI run ordering.
- Milestone B: logical-stack adoption/conversion and bulk adoption/linking. Both
  remain required for the complete requested workflow.
- Optional later enhancement: CSV explicit-clear syntax. It is not needed for
  ownership protection and is not a completion requirement.

Until stack adoption is available, require Legacy adoption to explicitly confirm
that the record represents one physical chassis. This is a user attestation, not
an application classification: if the user says it is a stack or is unsure, leave
it unlinked until the stack workflow is available. Do not claim an automatic
stack detector exists. Manual/CSV creation of physical stack members
continues to work during Milestone A.

## User workflows

### Start with an empty inventory

1. Open Inventory → Discovered devices. Query existing database observations;
   opening this page does not contact APIC or initiate collector runs.
2. Review hostname, serial, model, version, source label, last observation, ACI
   presence where applicable, and link status. Filter by source and link status.
3. Select Add to inventory. Milestone A supports Physical device with the Legacy
   single-chassis attestation. Milestone B adds Stack for Legacy; ACI node
   adoption continues to target a physical device.
4. For a physical device, prefill discovered technical fields, request remaining
   required values, and allow optional asset tag, membership, and placement.
5. Show the accepted values and ownership before saving. A material-observation
   review token rejects source changes between review and save. Create the asset and
   source link atomically. Placement uses existing collision validation.
6. Future successful collection refreshes source-owned fields automatically.

Milestone B bulk adoption provides per-row validation and shared defaults such as Vendor and
Height, explicitly applied by the user. It never invents a serial or assumes 1U.
Process each selected target transactionally and return per-row results; retrying
must not create duplicates. Do not present partial success as complete success.

### Link an existing asset

Suggest matches using valid normalized device serials only. Normalization trims
and case-folds without removing punctuation. Reject blank and known placeholder
values as match keys. Detect normalized duplicates rather than choosing a row.
Hostname, IP, and component serials are not identity match keys.

Even an exact match requires explicit confirmation in both milestones; bulk
confirmation becomes available in Milestone B. Display before/after technical fields. Different nonempty serials
block linking; a physical asset identity cannot be reassigned by clicking through.
Missing source serials require explicit manual target selection and an entered or
existing inventory serial. Capture that serial as the expected identity.

An already-linked source or target offers View linked asset or explicit Relink,
not another adoption. Source records recreated under a new identity require
explicit relinking; never infer continuity from hostname or IP alone.

### Manual entry and later linking

Add device → Manual retains full editing of technical and asset fields. No
discovery record is necessary for spares, powered-off devices, or backups.
Manual version is optional. Later linking preserves manual asset fields and
shows the technical changes for confirmation.

Unlink explicitly returns the target to manual ownership, retaining accepted
values and recording previous provenance in the audit log. Merely deleting or
losing a telemetry record does not silently release ownership.

### CSV import

Continue to accept existing full-device CSV files. Add optional version support
and metadata-only updates selected by serial. One row represents one physical
device, including one row per stack member.

| Match                                                        | Result                                                     |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| No inventory serial match                                    | Create manual asset; require all creation fields           |
| Existing manual asset                                        | Update explicitly supplied fields                          |
| Existing directly linked asset                               | Update manual fields; reject differing source-owned values |
| Member of a source-linked stack, without its own direct link | Physical member technical fields remain editable           |
| Ambiguous normalized serial or invalid row                   | Report row error; never guess                              |

Preserve column/cell intent through parsing, preview, and execution. Absent
columns and blank cells mean unchanged on updates. In this release, clear optional
manual fields through the device form; do not introduce a reserved CSV clear
token. On creation, blank optional fields become null. An explicit-clear CSV
syntax may be added separately. Identical supplied source-owned values are allowed. Changing
a serial through CSV is unsupported because serial is the lookup key; a new
serial is a new asset row and the preview must identify it as a creation.

Preview uses the same ownership policy as execution. Recheck identity, ownership,
and placement inside the write transaction; previews are not authorizations to
overwrite later changes. Retain the existing valid-row import behavior with
explicit skipped-row reporting. A conflict discovered during execution rolls
back that execution transaction and requests a new preview.

CSV does not create discovery links. After importing, use Discovered devices to
confirm suggested links, individually or in bulk. Existing stack CSV fields
continue to group members, subject to membership and master validation.

## Field ownership

| Target/field                                                                         | Owner after linking                  |
| ------------------------------------------------------------------------------------ | ------------------------------------ |
| Physical Device: name, serialNumber, model, version                                  | Direct device source                 |
| Device: assetTag, vendor, heightU, managementIp, status, placement, stack membership | User                                 |
| Stack: configured name and membership                                                | User                                 |
| Stack: observedHostname, observedVersion, observedManagementIp                       | Stack source                         |
| Stack member technical fields without a direct member source                         | User                                 |
| Source association and accepted identity                                             | Explicit admin link/relink operation |

Source-owned means protected in server mutation paths, including CSV, even when
the source is missing, conflicted, or disconnected. For missing required source
values, user input is accepted during adoption as a fallback, then protected;
later nonempty valid observations can fill name/model/version. Serial receives
the stricter identity checks below. Omitted/null/blank observations never erase
accepted values. Clearing accepted technical values requires explicit unlinking
and editing, not an incomplete telemetry payload.

## Physical stacks (Milestone B source adoption)

Example: Legacy reports `access-stack-01` with one management IP and one serial,
but the installation has three chassis. Inventory stores three Device records
with distinct serials, asset tags, heights, member numbers, and rack positions,
all belonging to one DeviceStack.

Adopt as Stack creates/selects that group and links the Legacy record to the
group. Require at least one real member to complete adoption; users may add the
other members later or import them first. Do not manufacture member identities
or claim the entered member count is the discovered count.

The reported Legacy serial is displayed as a source observation only. It is not
copied to all members and does not identify the logical stack: changing master
may change that reported serial. Stack links therefore do not apply chassis RMA
checks to this serial. Member hardware replacement remains a physical asset
operation. A future collector with per-member identity can support direct member
links; neither milestone may infer those from the single stack record.

A stack source updates only the stack's observed fields. It never changes
membership, user-selected master/role, member serial/model/version, or placement.
Display configured role as inventory metadata, not a claimed live election result.
Existing shared management-IP handling remains user-managed; do not propagate a
source IP change across members automatically.

Moving/removing members does not move the stack source. Block deletion of the
last member of a linked stack, including implicit empty-stack cleanup, until the
admin explicitly unlinks the stack. An explicit conversion from an incorrectly
adopted standalone source to a stack must atomically detach/reassign the link,
preserve the original physical asset, and leave it as an editable member.

## Proposed data model

Add `version String?` and `source InventorySource?` to Device. Keep existing
required fields and relations unchanged. Add these fields to DeviceStack:

```prisma
observedHostname     String?
observedVersion      String?
observedManagementIp String?
source               InventorySource?
```

Add inverse `inventorySource InventorySource?` relations to NodeSnapshot and
LegacyDevice. New model (enum declarations described below):

```prisma
model InventorySource {
  id String @id @default(cuid())

  deviceId String? @unique
  device Device? @relation(fields: [deviceId], references: [id], onDelete: Cascade)
  deviceStackId String? @unique
  deviceStack DeviceStack? @relation(fields: [deviceStackId], references: [id], onDelete: Cascade)

  kind InventorySourceKind
  nodeSnapshotId String? @unique
  nodeSnapshot NodeSnapshot? @relation(fields: [nodeSnapshotId], references: [id], onDelete: SetNull)
  legacyDeviceId String? @unique
  legacyDevice LegacyDevice? @relation(fields: [legacyDeviceId], references: [id], onDelete: SetNull)

  sourceKey String
  sourceLabel String
  matchedOn InventoryMatchMethod
  serialAtLink String?

  conflictReason String?
  lastSeenAt DateTime?
  lastAppliedAt DateTime?
  lastAppliedObservationAt DateTime?
  acceptedRevision Int @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([kind, sourceKey])
  @@map("inventory_source")
}
```

`InventorySourceKind`: `ACI`, `LEGACY`. `InventoryMatchMethod`:
`SERIAL`, `MANUAL_SELECTION`. No `isPrimary`, `manualOnly`, component match mode,
or persisted stale/disconnected enum is needed.

`sourceKey` is an unambiguous serialization of the source identity tuple, such
as JSON encoding `[apicHostId, dn]` or `[siteKey, hostnameKey]`, not delimiter
concatenation that can collide. It is retained after deletion, never includes
credentials, and reserves the identity until explicit relinking/unlinking.
`sourceLabel` retains a human-readable source name and context. Refresh labels
only while a source exists; audit old provenance before a relink changes it.

Use normal unique constraints for target and source exclusivity. Add migration
CHECK constraints for exactly one target and source kind/reference compatibility:
ACI must have no Legacy FK; Legacy must have no ACI FK. Allow the relevant source
FK to become null after deletion. Require a nonnull matching FK on initial linking
in the service. Require device links to have a valid serialAtLink; stack links
leave it null. Milestone B permits only Legacy stack links; Milestone A cannot
create stack-target links.

These cross-column constraints are deliberate migration SQL, not accidental
schema drift. Document them beside the Prisma model and cover fresh migrations
and invalid writes in database tests. No partial unique index is required.

## Durable reconciliation data

Persist a small outbox entry in the same transaction as each accepted change to
source technical metadata or presence. Do not acquire inventory asset/link locks
or write inventory audit records during ingestion. The entry contains immutable,
normalized accepted metadata, field presence, observation time, retained source
identity/label, and the source revision. No credentials or full feature payloads.

```prisma
model InventoryReconcileJob {
  id String @id @default(cuid())
  kind InventorySourceKind
  sourceKey String
  sourceRecordId String
  sourceRevision Int
  observation Json
  createdAt DateTime @default(now())
  availableAt DateTime @default(now())
  attempts Int @default(0)
  lastError String?
  completedAt DateTime?

  @@unique([kind, sourceRecordId, sourceRevision])
  @@map("inventory_reconcile_job")
}
```

Add `inventoryRevision Int @default(0)` to NodeSnapshot and LegacyDevice.
Increment within the serialized source update and enqueue atomically only when
accepted technical metadata/presence changes, including transition into a
metadata-ordering conflict. Equal observations and freshness-only feature payloads
need no job. Jobs contain the full accepted technical projection, including
retained fields, rather than rereading a later mutable source row.

Jobs retain sourceRecordId as a plain string, not a cascading FK. Revision
uniqueness and worker ordering are scoped to that source-row lifetime; a recreated
source can restart its counter without colliding with retained jobs. The worker
compares sourceRecordId with the current link FK before applying anything.

Legacy also needs a persisted technical-metadata ordering record: per-field
collected-at watermarks (a documented, validated JSON structure is acceptable)
and a metadata-conflict indication. Compare each supplied field independently;
an older observation may fill an unobserved field but cannot regress a newer
value. A duplicate receipt changes no accepted metadata. Equal-time disagreements
retain the prior value and flag a conflict. This must be enforced in ingestion,
including before any inventory link exists. Receipt freshness stays separate.

Adoption/relinking locks the source briefly, accepts its current revision and
projection, and initializes InventorySource.acceptedRevision to that revision.
Older queued jobs cannot overwrite the just-reviewed baseline. A worker only
applies a job if the live source FK still identifies the same source, the target
still has that link, and the job revision exceeds acceptedRevision. On a conflict,
record the result and advance the processed revision atomically without changing
accepted asset identity. Deleted/recreated sources with a reserved key need an
explicit relink; queued jobs never restore a missing FK.

Use Int revision counters and a string job ID. The existing codebase already uses
BigInt for telemetry counters, but this feature does not require it. Revisions
are server bookkeeping and should be omitted from client DTOs; job identifiers
are strings in administrative responses/logs. Validate JSON observations and test
JSON response serialization. Revisions must never wrap/reset within one source
row lifetime; fail explicitly on exhaustion rather than reusing an old revision.

Create these migration-managed PostgreSQL partial indexes (Prisma model fields
currently retain camelCase column names):

```sql
CREATE INDEX inventory_reconcile_job_pending_due_idx
  ON inventory_reconcile_job ("availableAt", "createdAt", id)
  WHERE "completedAt" IS NULL;

CREATE INDEX inventory_reconcile_job_pending_source_idx
  ON inventory_reconcile_job (kind, "sourceRecordId", "sourceRevision")
  WHERE "completedAt" IS NULL;
```

Keep the source-revision unique constraint for all rows. Document partial indexes
next to the model and test their creation in fresh migrations. Completed-row
retention is maintenance work, not part of the hot claim query.

## Freshness and identity

Derive connection and presence independently of conflict:

- Relevant source FK null: Disconnected, using retained provenance and values.
- ACI source exists with `present: false`: Missing from latest successful scan.
- Existing source: show source observation/receipt time; do not equate this with
  live reachability. `present: true` can persist through collection outages.
- Legacy: show Last received. Do not infer stale from `active` or introduce an
  arbitrary timeout. A configurable freshness policy is deferred.
- `conflictReason` nonnull: Needs review, displayed alongside connection state.

No read-side mutation is required to mark disconnected or missing. Source
deletion paths must invalidate affected cached inventory/discovery reads.

For physical links, compare normalized incoming nonempty serial with serialAtLink
and inventory identity before applying any technical fields. A mismatch freezes
the entire technical update, records a conflict, and preserves manual metadata.
An absent serial preserves identity without asserting a match. A unique serial
collision also becomes a review conflict. Do not transfer an asset tag or rack
position to replacement hardware automatically.

Resolution offers retaining the old asset and creating/linking a replacement, or
unlinking and correcting a verified data-entry error before linking again. Show
the changes and audit them. Relinking itself is not permission to overwrite a
different physical serial. When a later valid observation again agrees with the
accepted identity, reconciliation can clear that conflict and resume updates.

## Reconciliation and consistency

Use one domain service for linking, ownership validation, and field application.
Ingestion commits telemetry plus its bounded outbox insert. Inventory application
runs after that commit in separate, short transactions. Outbox persistence itself
is intentionally atomic with telemetry and can fail that commit; downstream
asset contention, audit failures, or worker timeout cannot roll telemetry back.
Measure enqueue overhead on large fabrics; do not merely increase the existing
30-second transaction timeout.

A scheduled worker drains due jobs even when no inventory page is opened and no
further source event arrives. Integrate a bounded drain into the existing
server-side scheduler tick, independent of whether any APIC schedules are enabled.
Document and test that tick operation for Legacy-only deployments. An awaited,
bounded post-commit drain may improve latency, but is not the recovery mechanism.
Do not use read-triggered writes or untracked background promises as the only
consumer. Show Pending refresh/Refresh failed separately from source freshness.

Strict per-source revision ordering is required. Full projections alone do not
justify skipping intermediate serial/conflict observations. SKIP LOCKED chooses
between eligible source heads, not arbitrary due jobs. A job is eligible only
when due and no earlier incomplete job exists for its `(kind, sourceRecordId)`,
including a predecessor currently locked or waiting in backoff:

```sql
SELECT j.*
FROM inventory_reconcile_job AS j
WHERE j."completedAt" IS NULL
  AND j."availableAt" <= (now() AT TIME ZONE 'UTC')
  AND NOT EXISTS (
    SELECT 1 FROM inventory_reconcile_job AS earlier
    WHERE earlier.kind = j.kind
      AND earlier."sourceRecordId" = j."sourceRecordId"
      AND earlier."sourceRevision" < j."sourceRevision"
      AND earlier."completedAt" IS NULL
  )
ORDER BY j."availableAt", j."createdAt", j.id
FOR UPDATE OF j SKIP LOCKED
LIMIT 1;
```

Claim and apply under the same short transaction; do not release the job lock
before completion. A backed-off or failing head blocks only its own source; other
sources proceed. Do not filter the predecessor subquery by availableAt. Retry
administration may bring the failed head forward after a fix, but cannot silently
skip it. The processed-revision check still protects replay and explicit
adoption/relink baselines; it is not a replacement for ordered queue claiming.

Lock current target/link state using the
same ordering as edits, imports, and relinks. Apply accepted changes, conflict
metadata, audit records, processed revision, and job completion atomically.
A crash rolls back both application and completion. On unexpected failure, roll
back, then record bounded backoff/attempt/error information in a separate short
transaction. Persist failed work for retry and expose failures; do not silently
acknowledge or discard it. Bound work per tick and retain completed jobs for a
configurable operational retention window.

Domain conflicts are completed review outcomes, not worker exceptions. Deduplicate
identical observations before enqueueing; do not coalesce different serial
observations in a way that hides a hardware-identity transition. Delayed Legacy
metadata is handled at the source as described above, not solely by a worker
watermark. Freshness-only payloads avoid inventory locks entirely.

Only apply nonempty technical fields whose values change. Update Device.updatedAt
only for actual asset changes. lastAppliedAt records accepted reconciliation;
acceptedRevision tracks processed jobs, including conflict outcomes. Preserve
manual fields and the serial replacement rules in every retry.

Implement a shared per-host node-resync lease with fencing for manual and
scheduled entry points before APIC fetch. Store its token/generation and expiry
on ApicHost (or a dedicated host-lease row). Acquisition is atomic; active claims
return a clear busy result. Renew long fetches as needed. The node write
transaction must lock and verify the same unexpired token before any snapshot,
missing-node, or outbox write. A reclaimed lease invalidates the old run; release
must compare the token so an old run cannot release its successor. No database
transaction remains open during APIC network calls. The existing schedule claim
continues to serve schedule coordination but cannot replace this host guard.
A failed or fenced-out run must not mark nodes missing or enqueue inventory work.

Audit adoption, link, unlink, relink, conflict resolution, and actual automatic
technical changes with source context and a system actor where appropriate.
Repeated identical observations/conflicts must not flood the audit log. Invalidate
inventory caches after successful inventory commits and telemetry presence/source
deletion changes. Use existing bounded cache expiry as crash recovery if the
process exits after commit but before invalidation. Preserve existing ACI/Legacy
cache behavior.

## Worker deployment and health (Milestone A)

Automatic refresh has a hard deployment dependency: configure SCHEDULER_TOKEN
and run `scheduler/tick.sh` (the compose scheduler service) or an equivalent
periodic authenticated caller of `/api/cron/tick`. The existing endpoint returns
503 without the token. A token alone does not prove a caller is running.

Run the bounded inventory drain before and outside the APIC schedule loop so
zero schedules, disabled schedules, or long APIC runs do not skip that tick's
drain. Record drain health even with an empty queue. Isolate drain errors from
APIC schedule execution and expose both outcomes in the tick response/logs.

Add a singleton InventoryWorkerHealth record with string id, nullable
lastStartedAt/lastCompletedAt/lastSucceededAt/lastErrorAt timestamps, and nullable
lastError summary. Update start before each drain and completion after it. A
heartbeat is not proof every job succeeded: report failed/retrying jobs separately.
Expose configuration state, heartbeat age, pending count, oldest pending age,
and failed/retrying count through an authenticated admin health DTO without the
token. Read fresh or with a short bounded cache; page reads never run the worker.

Display these distinct states on Discovery and linked-asset views, with setup
instructions for admins:

- Worker not configured: token missing.
- Worker not observed: token set but no completed drain heartbeat recorded.
- Worker heartbeat overdue: last completed drain exceeds the configured worker
  health window; say it may be stopped/stalled, not that process absence is proven.
- Worker error: recent drain failure; show a sanitized cause and last success.
- Worker running with pending work, or healthy and caught up.

Use a 20-minute default worker heartbeat window, configurable via
INVENTORY_WORKER_STALE_AFTER_SECONDS. This is an operational worker-health rule,
not a Legacy device freshness threshold. Validate it against the configured tick
interval and request budget (the current script allows 900 seconds per request
and defaults to 60 seconds between calls); require a larger window for slower
custom schedules. Show actual timestamps even before the window expires.

Manual entry and telemetry ingestion continue when the worker is unavailable.
Never show a successful telemetry collection as proof Inventory was refreshed.
Adoption screens must visibly disclose unavailable automatic refresh. Deployment
verification must prove the periodic drain runs in a Legacy-only installation,
after restart, and with no browser activity. Setup documentation must include
both token configuration and starting/verifying the scheduler service.

## Acceptance criteria

Milestone B is additive and must retain every Milestone A criterion.

1. **A:** An empty inventory can adopt eligible ACI and Legacy physical-device
   observations individually without retyping available technical fields.
2. **A:** Manual devices and full CSV creation work without telemetry, including
   existing manual stack-member creation.
3. **A:** Linked physical devices refresh technical fields and retain every
   user-owned field. Forms and CSV cannot bypass ownership after source deletion.
4. **A:** Unknown serial/model and normalized duplicates are surfaced without
   fake defaults, duplicate adoption, or hostname/IP matching.
5. **A:** Legacy standalone adoption requires explicit single-chassis attestation;
   users answering stack/unsure cannot adopt through that path.
6. **A:** Version remains visible after source deletion; provenance stays readable.
7. **A:** ACI disappearance shows Missing; Legacy shows Last received without
   unsupported stale claims. Conflict and disconnected states can coexist.
8. **A:** Serial replacement preserves original asset metadata and requires review.
9. **A:** Replay, delayed observations, and concurrent writes cannot regress values
   or violate ownership. A backed-off source head blocks its later jobs while
   another source's head remains claimable.
10. **A:** Existing inventory remains manual and functional after migration.
11. **A:** Inventory failure cannot roll back committed telemetry. Work survives
    restart and drains without page views, enabled APIC schedules, or new events.
12. **A:** Manual and scheduled ACI resyncs share a fenced host guard; superseded
    runs cannot overwrite telemetry, presence, or inventory observations.
13. **A:** Missing worker configuration, no heartbeat, overdue heartbeat, and job
    failures are visible with actionable setup information. Legacy-only deployment
    passes drain/restart verification. DTOs pass JSON serialization tests.
14. **B:** One Legacy logical stack links to independently identified physical
    members. No serial/model/version is broadcast to them; conversion preserves
    the originally adopted physical asset.
15. **B:** Bulk adoption/linking provides per-row validation, explicit confirmation,
    retry-safe creation, and accurate partial-success results.

Milestone A satisfies criteria 1–13. Full delivery satisfies criteria 1–15.

## Deferred work

CSV explicit-clear syntax, nullable height, site-without-rack, component asset tracking, collector member
enumeration, multiple sources per target, automatic matching/adoption, fleet
freshness policies, and detailed inventory change-history UI are separate work.
