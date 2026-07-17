# Static-Port Bulk Snapshot Validation Design

## Goal

Reduce deployer Review latency for large static-port CSV uploads by replacing thousands of row-derived APIC GETs with a small number of paged class reads and in-memory indexed validation.

The change must preserve validation statuses, messages, row order, deployment and rollback write behavior, the existing request concurrency ceiling of 10, and request isolation.

## Context

The first Review performance change added HTTPS keep-alive, request-scoped exact-path caching, and in-flight deduplication. That removes repeated node and policy-group reads, but a typical 3,680-row static-port upload still has unique EPG, VLAN-conflict, and binding paths. The deploy validator therefore performs approximately 11,040 APIC GETs and still takes about five minutes.

The existing exact-path reader retains every distinct parsed result until the Review request completes. Replacing those results with compact indexes can reduce both request count and retained-object overhead.

## Considered Approaches

### 1. Increase request concurrency

This could reduce elapsed time but would preserve the approximately 11,000-query workload, increase APIC pressure, and violate the current requirement to leave concurrency unchanged. It is rejected.

### 2. Generate large APIC filters for only the CSV objects

An OR filter could request only relevant EPGs, paths, and bindings. This minimizes returned inventory, but thousands of values produce long URLs and complex escaping, and APIC filter-size limits make the approach fragile. Chunking the filters would also reintroduce many requests. It is not selected for the initial implementation.

### 3. Load paged class snapshots and build compact indexes

This uses stable APIC class endpoints, handles large fabrics with page and page-size parameters, and turns row validation into local `Set` and `Map` lookups. It may retrieve unrelated objects, but request-scoped lifetime, compact indexes, and pagination make the cost measurable and temporary. This is the selected approach.

## Scope

This change applies only to static-port Review validation:

- deploy validation uses bulk EPG/binding, node, bundle-policy-group, and physical-path snapshots;
- rollback validation uses the bulk EPG/binding snapshot;
- response pages are processed into compact indexes scoped to one Review request;
- only indexes and final validation results remain intentionally retained after each page is parsed;
- deployment and rollback POST requests are unchanged.

Bridge-domain, EPG workflow, and interface-selector validators remain on the existing request-scoped exact-path reader. Review-table pagination and HTTPS keep-alive remain unchanged.

## Architecture

### Paged APIC class loader

Add a focused static-port snapshot module with a paged class-read helper. The helper requests page zero with a fixed page size of 5,000, reads APIC's `totalCount`, and then loads remaining pages sequentially. Each page is incorporated into compact indexes before the next page is requested, so the loader intentionally retains no complete multi-page inventory.

The four independent inventory components may load concurrently, producing at most four outstanding bulk reads. This remains below the existing concurrency ceiling of 10. The loader calls `apicFetch` directly because every page path is unique and exact-path deduplication has no value here; it still uses the shared HTTPS keep-alive agent.

The helper treats a failed page as a failed inventory component. It never validates against a partial snapshot because that could turn an APIC error into a false `not found`, `deploy`, or `missing` result.

Class reads are:

- `fvAEPg` with only `fvRsPathAtt` children for EPG existence and static bindings;
- `fabricNode` for fabric node existence;
- `infraAccBndlGrp` for PC and vPC interface-policy-group existence;
- `fabricPathEp` for direct physical path existence.

Deploy validation skips bundle or physical-path inventories when the CSV has no rows of the corresponding type. Rollback validation skips node and port inventories entirely.

### Compact snapshot indexes

The snapshot parser does not expose APIC response objects to the validator. It produces:

- `Set<string> epgDns` keyed by the EPG distinguished name;
- `Map<string, BindingState> bindingsByDn` keyed by the complete `fvRsPathAtt` distinguished name;
- `Map<string, string[]> bindingDnsByPathAndEncap` keyed by a collision-safe combination of `tDn` and `encap`;
- `Set<number> nodeIds`;
- `Set<string> bundleGroupNames`;
- `Set<string> physicalPathDns`.

Only the binding distinguished name is required for conflict messages. The index therefore does not retain complete APIC managed-object payloads.

### Deploy validation flow

The validator loads the required snapshots once and then maps the original rows in CSV order:

1. Confirm the row's EPG DN is present.
2. Confirm all required node IDs are present.
3. Confirm the bundle group or physical path is present.
4. Look up bindings with the same path and VLAN. A binding is a conflict when its DN differs from the row's intended binding DN.
5. Return `exists` when the intended binding DN is present; otherwise return `deploy`.

The result status, row index, and existing user-facing messages remain unchanged. Snapshot HTTP and network failures produce error results for rows dependent on the failed inventory component.

### Rollback validation flow

Rollback loads only EPG/binding state. Each row returns `rollback` when its intended binding DN exists and `missing` otherwise. A failed binding snapshot produces an error result rather than `missing`.

### Request lifetime and memory

Snapshots are created inside one top-level Review call and are never stored in module-global state, a database, or the browser. Concurrent users never share APIC data or authentication state.

Peak memory consists of up to four buffered response pages, their parsed JSON, compact indexes, and validation results. Fabric size rather than CSV size determines response volume. The implementation avoids unrelated EPG child classes and processes each page directly into indexes. Simultaneous Review requests can multiply per-request memory, so no cross-request cache is introduced.

## Error and Correctness Semantics

- No partial class snapshot is treated as authoritative.
- A fresh Review always fetches fresh APIC state.
- Deploy and rollback writes never use or mutate snapshot data.
- Exact DN, path, and encap values are used as returned by APIC; display-name parsing is avoided where an exact attribute exists.
- Missing `totalCount` falls back to the number of objects in page zero and does not cause an unbounded paging loop.
- Invalid or non-numeric `totalCount` is treated the same as missing metadata.
- Empty successful snapshots are valid and produce the existing missing-object results.

## Testing

Automated tests will cover:

- one-page and multi-page class loading;
- missing and malformed `totalCount` handling;
- rejection of partial snapshots when a later page fails;
- parsing EPGs, bindings, nodes, bundle groups, and physical paths into compact indexes;
- deploy rows returning `deploy`, `exists`, missing-object errors, and VLAN-conflict errors from snapshot data;
- rollback rows returning `rollback` and `missing` from snapshot data;
- class-request counts remaining constant as CSV row count grows;
- skipping unused bundle, physical-path, node, and port inventories;
- original row ordering and user-facing messages;
- unchanged POST paths and payloads through the existing deployment tests;
- targeted static-port tests, full project tests, lint, and production build.

## Non-goals

- Increasing validation or deployment concurrency.
- Persisting snapshots between Review requests.
- Streaming validation results to the browser.
- Refactoring other workflow validators to class snapshots.
- Changing APIC deployment or rollback writes.
- Building arbitrary CSV-derived OR filters in this iteration.
