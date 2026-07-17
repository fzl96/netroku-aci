# Static-Port Hybrid Validation Design

## Goal

Use request-scoped exact APIC reads for small static-port Reviews and paged bulk snapshots for large Reviews, with a fixed boundary of 100 parsed CSV rows.

## Selected Approach

Static-port deploy and rollback validation select one strategy once per Review request:

- 0 through 100 rows use exact managed-object GETs with the existing request-scoped cache, in-flight deduplication, concurrency limit of 10, and HTTPS keep-alive transport.
- 101 or more rows use the existing paged bulk snapshot and compact in-memory indexes.

The comparison is strictly `rowCount > 100` for bulk selection. A Review containing exactly 100 rows therefore uses exact validation; a Review containing 101 rows uses bulk validation.

This combines the two existing designs. Exact validation avoids downloading unrelated fabric inventory for small CSVs. Bulk validation prevents unique EPG, conflict, and binding paths from producing thousands of round trips for large CSVs.

## Architecture

Move the previously implemented exact deploy and rollback validators into a focused `static-port-exact.ts` module. Each exact validation call creates one request-scoped `ApicReader` unless a reader is injected by a unit test. The exact deploy validator preserves its phased reads:

1. EPG existence.
2. Required node existence.
3. Bundle group or physical-path existence.
4. Path-and-VLAN conflict state.
5. Intended binding state.

The existing snapshot-backed validation remains responsible for bulk deploy and rollback behavior. The public `validateDeployRows` and `validateRollbackRows` functions become small dispatchers based only on the parsed row count. Deployment and rollback POST functions remain unchanged.

HTTPS keep-alive remains shared by both strategies. The exact reader retains its exact-path cache, while snapshot pages remain unique direct reads through the same keep-alive agent.

## Correctness and Error Semantics

- Strategy selection never changes within one Review request.
- Both strategies return one result per input row in original CSV order.
- Existing statuses, missing-object messages, conflict messages, and APIC/network error handling are preserved within each strategy.
- Empty row arrays return immediately through exact validation without issuing APIC reads.
- Deploy and rollback writes do not consult the threshold and are unchanged.
- Bridge-domain, EPG workflow, and interface-selector validation are outside this change.

## Testing

Automated tests will prove:

- row counts 0, 1, and 100 select exact validation;
- row counts 101 and 3,680 select bulk validation;
- the public deploy and rollback dispatchers use the same boundary;
- small exact deploy validation deduplicates shared node and policy-group paths;
- small exact rollback validation deduplicates identical binding targets;
- snapshot-backed deploy and rollback behavior remains covered by the existing tests;
- deployment and rollback POST behavior remains unchanged;
- APIC/Review tests, feature-scoped lint, the full test suite, and the production build retain their recorded results.

## Non-goals

- Dynamically tuning the threshold from observed latency.
- Making the threshold configurable through the UI or environment.
- Using CSV-derived APIC OR filters.
- Changing concurrency limits.
- Applying hybrid selection to other workflow validators.
