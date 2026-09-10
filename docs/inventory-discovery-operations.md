# Inventory discovery operations

## Deploy

1. Deploy the application code and generate its Prisma client with the installed
   toolchain (`bun run prisma:generate`).
2. Apply migrations before serving the new code: `bun run prisma:deploy`.
   Compose's migration service already applies migrations before the app starts.
3. Configure a nonempty `SCHEDULER_TOKEN` in both the app and scheduler, and run
   the scheduler service (`docker compose up -d scheduler`) or an equivalent
   authenticated periodic caller of `POST /api/cron/tick`.
4. Open Inventory → Discovered devices and check the worker completion timestamp.
   Verify this even if the installation only receives Legacy data and has no
   configured APIC schedules. `POST /api/cron/resync` alone does not drain inventory.

The migration is additive for physical inventory: it preserves IDs, technical
values, asset tags, vendor, height, status, IP, rack placement, and stack membership.
Version starts unknown and all existing inventory remains manual. Legacy's new
per-field ordering clocks are conservatively initialized from its latest receipt
(or record creation time) to prevent delayed pre-upgrade observations from
regressing existing metadata. Existing observation values are not rewritten.

The implementation has not applied migrations to the user's configured database.
Use normal database backup and deployment procedures when rolling it out.

## Existing inventory and adoption

Filter discoveries by ACI/Legacy, hostname/serial, and linked status. Select rows
for review. Confirm proposed technical values and choose Add physical device,
Link existing physical asset, or (Legacy only) Link logical stack. Up to 25 rows
are displayed per page; the action API caps a batch at 50.

Exact, normalized serial matches are suggestions requiring confirmation. A link
uses the existing device ID, preserving manual fields. Normalization trims and
case-folds, preserving punctuation. Missing or placeholder serials require user
input/selection; ambiguous normalized duplicates must be resolved first.

A review token rejects material source changes between review and save. If a
batch partially succeeds, each row reports its result. Refresh before retrying
an interrupted request; successful links are retained and never create duplicates.
Target selectors return up to 200 search results plus exact serial matches for
this discovery page. Use Find asset or stack targets to narrow the selection.

New physical assets require vendor and explicit height, plus any technical fields
not reported by discovery. Shared vendor/height inputs apply only when explicitly
selected. Set management IP, stack membership, and rack placement using existing
Inventory editing/placement after adoption. Spare, offline, backup, and untracked
assets can still be created and fully maintained manually.

## Ownership and replacements

A directly linked device's hostname, serial, model, and version are protected on
both server forms and CSV imports. Version is the last accepted value, retained
when a source disappears. Vendor, asset tag, height, IP, lifecycle status, placement,
and stack membership remain user-controlled. Discovery does not infer retirement
or delete physical assets. Blank observations do not erase accepted values.

A changed physical serial freezes technical updates and shows a conflict. Keep
that asset and add/link replacement hardware separately. For a verified entry
error, explicitly unlink, correct the manual record, then link again. An absent
serial cannot clear a replacement conflict. Explicit relinking preserves previous
source context in the audit log. Deleting telemetry leaves a disconnected link;
it does not silently release ownership. Use Unlink source to resume manual edits.

ACI missing-node state means absent from a successful scan, not proven powered
Off. Legacy displays Last received with no invented device-staleness threshold.
Worker health and pending inventory refresh are separate from device freshness.

## Stacks

One inventory Device represents one physical member with its own serial, model,
asset tag, height, and rack position. Import/create members first, then adopt a
Legacy discovery as a logical stack using an existing group or selected unassigned
members. Selected member order determines the initial numbering and configured
master; these remain editable inventory metadata, not live election telemetry.

The logical source refreshes only observed stack hostname, version, and IP. Its
single reported serial is not copied to members; a master change must not be
interpreted as replacing all physical assets. The stack section on each member's
detail page shows these observations separately. A linked stack's last member
cannot be removed until its source is explicitly unlinked.

To convert an incorrectly linked standalone source, select its discovery, choose
Stack, and explicitly replace the source association. Include the original physical
asset in the destination group. Conversion preserves that asset and releases its
technical fields to manual ownership; the source now describes the group.

## CSV

A serial column identifies each row. New assets also require hostname, vendor,
model, and height. `version` / `software_version` is optional. Existing full CSV
files remain usable when they supply explicit heights.

On updates, absent columns and blank cells preserve existing values. Use forms
to clear optional manual fields; there is no CSV clear token. Identical technical
values on linked assets are allowed, but different values are row errors. Preview
and execution share ownership checks; an intervening relevant change requires a
new preview. Validation errors are reported per row; importing valid rows reports
skipped errors explicitly. A different serial is a new asset, not a rename.

Stack CSVs still use one row per member and the existing stack columns. Imports
create manual assets and never implicitly attach discovery sources. After import,
confirm suggested source links in Discovered devices.

## Worker troubleshooting

The tick drains inventory before the APIC schedule loop. Jobs and telemetry commit
atomically; a separate short transaction applies inventory fields and its audit
record. Audit/database failures during application cannot roll back already
committed telemetry. Jobs are processed in source-revision order: a failing head
blocks later observations for that source while other sources proceed.

Failures back off from 30 seconds to a maximum of one hour. Correct the reported
server-side cause and allow the next automatic retry. Do not delete failing jobs
just to unblock successors: that could hide a hardware-identity transition.
Completed jobs are retained for `INVENTORY_JOB_RETENTION_DAYS` (default 7, maximum
365), then removed in bounded batches. Pending work survives process restarts.

- **Worker not configured:** set the token in the app and scheduler.
- **Worker not observed:** the token exists but no completed drain has been seen;
  start/check the scheduler service and its tick URL.
- **Worker heartbeat overdue:** inspect the caller and app logs for a stopped or
  stalled tick. This does not prove a device is offline.
- **Worker error / retrying jobs:** inspect app logs for the job failure, correct
  the cause, and wait for retry. Pending count and oldest observation time show lag.

`INVENTORY_WORKER_STALE_AFTER_SECONDS` defaults to 1200 (20 minutes), with a minimum
of 1200. Increase it if a custom tick interval plus the request timeout exceeds
that window. This worker-health threshold is independent of Legacy device freshness.
Never expose the scheduler token in screenshots or status endpoints.

## Verification

Run focused tests with `bun test src/lib/inventory src/lib/legacy-ingest
src/lib/apic/nodes.test.ts src/lib/nodes src/lib/apic-hosts src/lib/history`.

PostgreSQL integration tests require a dedicated local database whose name is
`inventory_test`; set `INVENTORY_TEST_DATABASE_URL` and run
`bun test tests/integration/inventory-discovery.test.ts` in its own process.
Do not point it at an application database: it inserts fixtures and deliberately
adds/removes an audit-failure constraint. Apply migrations to the test DB first.

`python3 scripts/verify-inventory-upgrade.py` checks the migration against 500
existing assets and a pre-upgrade Legacy record. It requires an empty, dedicated
local `inventory_upgrade_test` database via `INVENTORY_UPGRADE_TEST_DATABASE_URL`
and PostgreSQL's `psql` on PATH. It refuses other database names/remote hosts.

Browser/visual review is being performed by the user. Suggested checks: individual
and bulk existing-asset linking, manual spare entry, CSV patch import, three-member
stack adoption/conversion, narrow layout, and disconnected-source detail display.
