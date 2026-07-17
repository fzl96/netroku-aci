# Review Validation Performance Design

## Goal

Reduce deployer Review latency for large CSV uploads without weakening APIC validation, changing deployment semantics, or increasing the existing validation concurrency of 10 rows.

## Scope

This change includes:

- request-scoped caching and in-flight deduplication for APIC GET requests;
- HTTPS connection reuse through a bounded keep-alive agent;
- validation organized around unique APIC managed objects for static ports, bridge domains, and EPGs;
- client-side pagination for the Review table and issues list at 100 rows per page.

Interface-selector validation logic and validation concurrency remain unchanged. Interface-selector traffic will still use the shared keep-alive transport because all APIC requests use the same client.

Deployment and rollback writes are not cached, retried, regrouped, or otherwise changed.

## Architecture

### Request-scoped APIC reader

Introduce a focused APIC read-cache module. Each top-level validation request creates a new reader from its APIC host and token. The reader owns a `Map<string, Promise<ApicGetResult>>`, keyed by the exact APIC GET path.

On a cache miss, the reader starts the APIC request and stores its promise before awaiting it. Concurrent consumers of the same path therefore share one in-flight request. Successful and HTTP-error responses are parsed into immutable results and retained until validation completes. A rejected network promise is removed from the map so a later access can make a fresh attempt.

The cache is never module-global. It is discarded when the validation handler returns, preventing data from crossing users, tokens, APIC hosts, or separate Review runs. POST requests continue to call `apicFetch` directly and bypass this reader.

### Unique managed-object loading

Static-port, bridge-domain, and EPG validation will collect the exact APIC paths needed for shared managed objects and load each unique path once through the request-scoped reader. The existing parallel runner remains capped at 10.

Loading is phased where the current validator short-circuits on a missing parent:

1. Load unique shared parents.
2. Identify rows that fail those parent checks.
3. Load target state only for rows with valid parents.
4. Produce one validation result for every original row in original CSV order.

Workflow grouping is as follows:

- Static ports: unique EPG paths, node paths, and port/IPG paths; VLAN-conflict and binding paths remain row-derived but exact duplicates are still deduplicated by the reader.
- Bridge domains: unique tenant, VRF, L3Out, bridge-domain, and bridge-domain-children paths as applicable to L2/L3 and deploy/rollback validation.
- EPGs: unique tenant, application-profile, bridge-domain, physical-domain, contract, EPG, and EPG-children paths. Rows sharing an EPG reuse the same EPG state while retaining row-specific contract and relation decisions.

Interface-selector validators are not refactored in this iteration.

### HTTPS keep-alive

Configure the shared HTTPS agent with:

- `keepAlive: true`;
- `keepAliveMsecs: 1_000`;
- `maxSockets: 20`;
- `maxFreeSockets: 10`;
- `scheduling: 'lifo'`.

The socket limit supports the existing nested request patterns without increasing validation worker concurrency. The response buffering already performed by `apicFetch` allows sockets to return to the agent pool after each response.

No automatic GET or POST retry is added in this change.

### Review pagination

The Review table will use local component state and a fixed page size of 100. Only the current page slice is rendered, while validation summaries, actionable-row selection, Deploy/Rollback actions, and session-expiration detection continue to operate on the complete row and result collections.

Controls show the visible range and total, plus Previous and Next actions. The current page resets to one when the uploaded rows, workflow feature, or mode changes and is clamped if the row count shrinks.

The issues list will only mount while expanded and will use its own 100-item page. Closing it removes issue rows from the DOM and resets its page to one. This prevents a collapsed list of thousands of skipped/error entries from remaining rendered.

## Error and Correctness Semantics

- Existing statuses, messages, row ordering, and short-circuit rules remain unchanged.
- HTTP errors such as 401, 404, and 500 are shared for identical paths within one Review request.
- Network rejections are not permanently retained in the cache.
- A fresh Review always starts with an empty cache and observes current APIC state.
- Cached reads are never reused after deployment or rollback writes.
- Pagination affects presentation only; all actionable rows remain included when the user proceeds.

## Testing

Automated tests will cover:

- concurrent requests for the same path invoke the underlying APIC fetch once;
- different paths remain independent;
- rejected requests are evicted and can be attempted again;
- separate readers do not share cached state;
- the HTTPS agent exposes the approved keep-alive and socket settings;
- representative static-port, bridge-domain, and EPG rows sharing parents produce unchanged ordered results while reducing underlying GET counts;
- pagination returns correct first, middle, final, empty, and clamped page slices;
- full project tests, lint, and production build remain successful.

## Non-goals

- Increasing validation or deployment concurrency.
- Interface-selector-specific grouping or subtree-query optimization.
- Fabric-wide APIC class snapshots or bulk-query redesign.
- Streaming partial Review results.
- Retrying APIC writes.
- Persisting APIC read results between HTTP requests.
