# Legacy Device Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone, pooled Python legacy-device collector and three authenticated `netroku-aci` ingestion APIs that persist normalized current state and full history.

**Architecture:** `netroku-cli/legacy_sync.py` performs SSH collection without integrating with the existing package, then sends one versioned payload per device and feature. `netroku-aci` validates those payloads and writes dedicated legacy Prisma models through per-device transactions with idempotent receipts and feature-specific reconciliation.

**Tech Stack:** Python 3.8+, Netmiko, requests, TextFSM/NTC templates, Next.js 16 route handlers, TypeScript, Zod 4, Prisma 6, PostgreSQL, Bun test, pytest.

## Global Constraints

- Work on branch `feat/legacy-device-ingestion` in both repositories.
- Do not register or modify existing `netroku-cli` commands; the collector is one standalone root file.
- Do not modify existing ACI models or resync route behavior.
- Use `LEGACY_INGEST_TOKEN` on the server and `NETROKU_LEGACY_INGEST_TOKEN` in the collector; never persist or log either token or device credentials.
- Keep health, interface, and endpoint APIs and transactions separate.
- Use one SSH session for monitor data and, in `all` mode, the endpoint commands for the same device.
- Default to 20 workers and never exceed the configured positive worker count.
- Treat only complete feature collections as absence-authoritative.
- Preserve full history indefinitely; no UI or retention work is in scope.
- Baseline: `netroku-aci` has 291 passing tests; `netroku-cli` has 105 passing and two unrelated pre-existing failures in `tests/test_endpoints_aci.py` because `get_transceivers` is not mocked.

---

### Task 1: Versioned payload schemas and bearer authentication

**Files:**
- Create: `src/lib/schemas/legacy-ingest.ts`
- Create: `src/lib/schemas/legacy-ingest.test.ts`
- Create: `src/lib/legacy-ingest/auth.ts`
- Create: `src/lib/legacy-ingest/auth.test.ts`

**Interfaces:**
- Produces: `legacyHealthPayloadSchema`, `legacyInterfacePayloadSchema`, `legacyEndpointPayloadSchema` and their inferred payload types.
- Produces: `isLegacyIngestAuthorized(header: string | null, expected: string): boolean`.
- Incoming contracts use snake_case exactly as documented in the approved design.

- [ ] **Step 1: Write failing schema tests**

Add table-driven tests that construct this valid base envelope and verify all three schemas, then reject unsupported versions, missing offsets, counters that are not decimal strings, malformed MAC addresses, percentages outside 0–100, and arrays over their feature limits:

```ts
const base = {
  schema_version: 1 as const,
  run_id: '18d187a6-6509-40bd-b246-cc3798780efa',
  collected_at: '2026-07-21T14:30:00+07:00',
  complete: true as const,
  device: {
    site: 'jakarta', hostname: 'SW-JKT-01',
    management_ip: '10.10.0.11', device_type: 'cisco_ios',
  },
}

expect(legacyInterfacePayloadSchema.safeParse({
  ...base,
  interfaces: [{
    name: 'GigabitEthernet1/0/1', description: '', ip_address: null,
    prefix_length: null, mtu: 1500, speed: '1000 Mb/s',
    admin_state: 'up', oper_state: 'up', input_errors: '0',
    output_errors: '0', crc_errors: '0',
  }],
}).success).toBe(true)
```

- [ ] **Step 2: Run the schema tests and confirm module-not-found failure**

Run: `bun test src/lib/schemas/legacy-ingest.test.ts`

Expected: FAIL because `legacy-ingest.ts` does not exist.

- [ ] **Step 3: Implement exact Zod contracts**

Use a shared strict envelope, `z.iso.datetime({ offset: true })`, trimmed non-empty identity strings, finite percentages, `/^\d+$/` counters, `/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/` MACs, `.max(500)` logs, `.max(20_000)` interfaces, and `.max(100_000)` endpoints. Export inferred TypeScript types for persistence services.

- [ ] **Step 4: Write and run failing timing-safe auth tests**

Cover exact match, missing header, wrong prefix, wrong value, and unequal lengths:

```ts
expect(isLegacyIngestAuthorized('Bearer expected-token', 'expected-token')).toBe(true)
expect(isLegacyIngestAuthorized('Bearer short', 'expected-token')).toBe(false)
expect(isLegacyIngestAuthorized(null, 'expected-token')).toBe(false)
```

Run: `bun test src/lib/legacy-ingest/auth.test.ts`

Expected: FAIL because the helper does not exist.

- [ ] **Step 5: Implement auth with `crypto.timingSafeEqual` and run focused tests**

Run: `bun test src/lib/schemas/legacy-ingest.test.ts src/lib/legacy-ingest/auth.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit the contract foundation**

```bash
git add src/lib/schemas/legacy-ingest.ts src/lib/schemas/legacy-ingest.test.ts \
  src/lib/legacy-ingest/auth.ts src/lib/legacy-ingest/auth.test.ts
git commit -m "feat: define legacy ingestion contracts"
```

### Task 2: Dedicated legacy Prisma schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260721090000_add_legacy_ingestion/migration.sql`

**Interfaces:**
- Produces Prisma models: `LegacyDevice`, `LegacyIngestReceipt`, `LegacyHealthSample`, `LegacyLogEntry`, `LegacyInterfaceSnapshot`, `LegacyInterfaceSample`, and `LegacyEndpoint`.
- Produces `LegacyIngestFeature` enum with `health`, `interfaces`, and `endpoints` mapped to lowercase database values.

- [ ] **Step 1: Add the models to Prisma schema**

Define the approved fields and relations, including:

```prisma
enum LegacyIngestFeature {
  health
  interfaces
  endpoints
}

model LegacyDevice {
  id                    String   @id @default(cuid())
  site                  String
  siteKey               String
  hostname              String
  hostnameKey           String
  managementIp          String
  deviceType            String
  vendor                String?
  model                 String?
  serialNumber          String?
  softwareVersion       String?
  location              String?
  active                Boolean  @default(true)
  firstSeenAt           DateTime @default(now())
  lastSeenAt            DateTime @default(now())
  lastHealthSyncAt      DateTime?
  lastInterfaceSyncAt   DateTime?
  lastEndpointSyncAt    DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  receipts              LegacyIngestReceipt[]
  healthSamples         LegacyHealthSample[]
  logs                  LegacyLogEntry[]
  interfaces            LegacyInterfaceSnapshot[]
  interfaceSamples      LegacyInterfaceSample[]
  endpoints             LegacyEndpoint[]
  @@unique([siteKey, hostnameKey])
  @@map("legacy_device")
}
```

Add receipt count columns; health sample arrays; log event hashes; interface snapshot presence; interface raw and delta `BigInt?` fields; and endpoint lifecycle fields. Use compound unique constraints for receipt and interface identity.

- [ ] **Step 2: Create migration SQL**

Create all enum/table/index/foreign-key statements matching the Prisma schema. Add the partial active endpoint constraint:

```sql
CREATE UNIQUE INDEX "legacy_endpoint_active_identity_key"
ON "legacy_endpoint"("deviceId", "mac", "ipKey")
WHERE "isActive" = true;
```

- [ ] **Step 3: Validate and generate Prisma client**

Run:

```bash
bunx prisma format
bunx prisma validate
bunx prisma generate
```

Expected: all commands exit 0 and the generated client exposes every legacy delegate.

- [ ] **Step 4: Commit schema and migration**

```bash
git add prisma/schema.prisma prisma/migrations/20260721090000_add_legacy_ingestion/migration.sql
git commit -m "feat: add legacy ingestion storage"
```

### Task 3: Shared ingestion identity, canonical hashing, and idempotency

**Files:**
- Create: `src/lib/legacy-ingest/common.ts`
- Create: `src/lib/legacy-ingest/common.test.ts`

**Interfaces:**
- Consumes: common envelope types from Task 1 and Prisma models from Task 2.
- Produces: `normalizeLegacyKey(value: string): string`.
- Produces: `canonicalPayloadHash(payload: unknown): string`.
- Produces: `IdempotencyConflictError`.
- Produces: `ingestLegacyFeature(db, feature, payload, apply): Promise<LegacyIngestResult>` where `apply` receives a transaction client, device ID, receipt ID, and collected date and returns count fields.

- [ ] **Step 1: Write failing normalization/hash tests**

Verify trim/lowercase identity, stable object-key ordering, preserved array ordering, matching hashes for reordered object keys, and different hashes for changed arrays.

- [ ] **Step 2: Write failing fake-database tests**

Cover automatic device creation, metadata update without clearing omitted values, identical duplicate return, changed-content conflict, and rollback propagation. Use a small in-memory fake implementing only `$transaction`, `legacyDevice.upsert`, and `legacyIngestReceipt.findUnique/create/update`.

- [ ] **Step 3: Run focused tests to verify failure**

Run: `bun test src/lib/legacy-ingest/common.test.ts`

Expected: FAIL because common ingestion functions do not exist.

- [ ] **Step 4: Implement stable canonicalization and transactional wrapper**

Recursively sort plain-object keys, retain array order, serialize dates as ISO strings, hash with SHA-256, and use the validated payload as the hash source. Normalize identity with Unicode normalization, trim, and lowercase. Upsert a device by `siteKey_hostnameKey`; only include optional metadata keys present in the payload.

Reserve the receipt at the start of the transaction. If Prisma reports a unique-key race, let that transaction roll back, then re-read the committed receipt outside the failed transaction: a matching hash is duplicate success and a different hash throws `IdempotencyConflictError`. Do not call `apply` for duplicates.

- [ ] **Step 5: Run focused tests**

Run: `bun test src/lib/legacy-ingest/common.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit shared persistence**

```bash
git add src/lib/legacy-ingest/common.ts src/lib/legacy-ingest/common.test.ts
git commit -m "feat: add idempotent legacy ingestion core"
```

### Task 4: Health persistence and health route

**Files:**
- Create: `src/lib/legacy-ingest/health.ts`
- Create: `src/lib/legacy-ingest/health.test.ts`
- Create: `src/lib/legacy-ingest/route.ts`
- Create: `src/lib/legacy-ingest/route.test.ts`
- Create: `src/app/api/ingest/legacy/health/route.ts`
- Modify: `src/lib/audit.ts`

**Interfaces:**
- Consumes: `LegacyHealthPayload`, auth helper, and shared ingestion wrapper.
- Produces: `ingestLegacyHealth(payload): Promise<LegacyIngestResult>`.
- Produces: `handleLegacyIngestRequest(request, schema, ingest, action): Promise<Response>`.

- [ ] **Step 1: Write failing health persistence tests**

Using a fake transaction client, verify one health sample per receipt, numeric/null fields, fan/PSU arrays, log insertion, timestamped-log dedup keys, receipt-scoped keys when timestamps are null, and `lastHealthSyncAt` updates.

- [ ] **Step 2: Implement `ingestLegacyHealth`**

Call the shared wrapper with feature `health`, create the sample, create only non-duplicate log events, update the feature timestamp, and return `{ inserted, updated, cleared, samples }` counts.

- [ ] **Step 3: Write failing route-handler tests**

Construct `Request` objects and cover missing server token (503), missing/wrong bearer token (401), malformed JSON (400), feature arrays over their declared maximum (413), other Zod failures (422), idempotency conflict (409), new result (201), duplicate result (200), and unexpected persistence failure (500).

- [ ] **Step 4: Implement shared route handler and thin health route**

The route passes `legacyHealthPayloadSchema`, `ingestLegacyHealth`, and `ingest.legacy.health` into the handler. Extend `AuditAction` with the three legacy ingestion names. Audit as user `legacy-collector`, include counts/run ID, and never include the payload or header.

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun test src/lib/legacy-ingest/health.test.ts src/lib/legacy-ingest/route.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit health ingestion**

```bash
git add src/lib/legacy-ingest src/app/api/ingest/legacy/health/route.ts src/lib/audit.ts
git commit -m "feat: ingest legacy health samples"
```

### Task 5: Interface snapshot reconciliation and samples

**Files:**
- Create: `src/lib/legacy-ingest/interfaces.ts`
- Create: `src/lib/legacy-ingest/interfaces.test.ts`
- Create: `src/app/api/ingest/legacy/interfaces/route.ts`

**Interfaces:**
- Consumes: `LegacyInterfacePayload` and shared ingestion/route helpers.
- Produces: `computeLegacyDelta(current: bigint, previous: bigint | null): bigint | null`.
- Produces: `ingestLegacyInterfaces(payload): Promise<LegacyIngestResult>`.

- [ ] **Step 1: Write failing delta and reconciliation tests**

Verify first sample null delta, monotonic subtraction, reset null, large BigInt safety, case-insensitive interface identity, snapshot upsert, omitted-interface `present: false`, raw sample insertion, and one previous-sample lookup per interface.

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/lib/legacy-ingest/interfaces.test.ts`

Expected: FAIL because interface ingestion does not exist.

- [ ] **Step 3: Implement interface persistence**

Deduplicate incoming rows by normalized interface name, upsert snapshots with `present: true`, mark other present rows absent, load latest samples, parse validated decimal counters with `BigInt`, compute nullable deltas, create one sample per interface, and update `lastInterfaceSyncAt`.

- [ ] **Step 4: Add the thin route and run focused tests**

The route delegates to the shared handler with the interface schema and audit action.

Run: `bun test src/lib/legacy-ingest/interfaces.test.ts src/lib/legacy-ingest/route.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit interface ingestion**

```bash
git add src/lib/legacy-ingest/interfaces.ts src/lib/legacy-ingest/interfaces.test.ts \
  src/app/api/ingest/legacy/interfaces/route.ts
git commit -m "feat: ingest legacy interface history"
```

### Task 6: Endpoint lifecycle reconciliation

**Files:**
- Create: `src/lib/legacy-ingest/endpoints.ts`
- Create: `src/lib/legacy-ingest/endpoints.test.ts`
- Create: `src/app/api/ingest/legacy/endpoints/route.ts`

**Interfaces:**
- Consumes: `LegacyEndpointPayload` and shared ingestion/route helpers.
- Produces: `planLegacyEndpointReconcile(active, fetched): LegacyEndpointPlan`.
- Produces: `ingestLegacyEndpoints(payload): Promise<LegacyIngestResult>`.

- [ ] **Step 1: Write failing pure planning tests**

Cover brand-new endpoints, unchanged placement, VLAN/interface moves, missing endpoint clearing, null-IP identity, duplicate fetched entries, and a complete empty list.

- [ ] **Step 2: Run tests to verify failure**

Run: `bun test src/lib/legacy-ingest/endpoints.test.ts`

Expected: FAIL because endpoint reconciliation does not exist.

- [ ] **Step 3: Implement planning and transactional mutations**

Canonical identity is `${mac}|${ip ?? ''}`; placement includes normalized interface and VLAN. Deduplicate fetched identities, bump unchanged active rows, clear moved/missing rows with `clearedAt`, insert new placements, and update `lastEndpointSyncAt`. Perform clear operations before inserts so the partial active index is never violated.

- [ ] **Step 4: Add route and run focused tests**

Run: `bun test src/lib/legacy-ingest/endpoints.test.ts src/lib/legacy-ingest/route.test.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit endpoint ingestion**

```bash
git add src/lib/legacy-ingest/endpoints.ts src/lib/legacy-ingest/endpoints.test.ts \
  src/app/api/ingest/legacy/endpoints/route.ts
git commit -m "feat: ingest legacy endpoint lifecycle"
```

### Task 7: Standalone collector parsing and payload construction

**Repository:** `netroku-cli`

**Files:**
- Create: `legacy_sync.py`
- Create: `tests/test_legacy_sync.py`

**Interfaces:**
- Produces CLI modes `monitor`, `endpoint`, and `all` via `main(argv: Optional[Sequence[str]] = None) -> int`.
- Produces import-safe helpers `load_inventory`, `merge_inventories`, `parse_f5_arp_files`, `normalize_interfaces`, `normalize_endpoints`, `build_health_payload`, `build_interface_payload`, and `build_endpoint_payload`.
- The file imports no `netroku_cli` modules.

- [ ] **Step 1: Write failing inventory/path/F5 tests**

Load the file with `importlib.util.spec_from_file_location`. Test six-column headerless CSV rows, malformed rows, duplicate identity, script-relative defaults, override paths, missing F5 warning behavior, multi-file F5 parsing, incomplete ARP removal, and canonical MAC output.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `PYTHONPATH=src .venv/bin/python -m pytest tests/test_legacy_sync.py -q`

Expected: FAIL because `legacy_sync.py` does not exist.

- [ ] **Step 3: Implement configuration, inventory, normalization, and payload builders**

Use `argparse`, `csv`, `dataclasses`, `datetime`, `pathlib`, `re`, `uuid`, and `requests`. Resolve defaults from `Path(__file__).resolve().parent`. Validate required environment variables and positive workers. Set `os.environ['NET_TEXTFSM']` before any device connection.

Copy the required temperature/fan/PSU/syslog parsing behavior into the standalone file rather than importing package internals. Normalize percentages to floats, counters to decimal strings, unknown endpoint IP to `None`, and sort interfaces/endpoints deterministically.

- [ ] **Step 4: Add payload fixture tests**

Use representative IOS and NX-OS parsed dictionaries to assert exact schema-version-1 health, interface, and endpoint envelopes, physical-interface exclusion, metadata mapping, F5 IP enrichment, and no credential keys anywhere in serialized payloads.

- [ ] **Step 5: Run focused tests**

Run: `PYTHONPATH=src .venv/bin/python -m pytest tests/test_legacy_sync.py -q`

Expected: all current collector tests PASS.

- [ ] **Step 6: Commit collector parsing**

```bash
git add legacy_sync.py tests/test_legacy_sync.py
git commit -m "feat: add standalone legacy payload collector"
```

### Task 8: SSH orchestration, pooled execution, and API publishing

**Repository:** `netroku-cli`

**Files:**
- Modify: `legacy_sync.py`
- Modify: `tests/test_legacy_sync.py`

**Interfaces:**
- Consumes Task 7 normalization/payload helpers.
- Produces `collect_device_work(work: DeviceWork, f5_lookup, run_id, collected_at) -> DeviceResult`.
- Produces `publish_payload(session, base_url, token, feature, payload) -> PublishResult`.
- Produces `run_sync(args) -> RunSummary`.

- [ ] **Step 1: Write failing single-session and completeness tests**

Use a fake Netmiko connection that records commands. Assert monitor runs version/resources/environment/log/interface commands; endpoint runs MAC/VLAN/switchport commands; `all` runs the union through one connection; disconnect always runs; raw/unparsed required results suppress only the affected feature payload.

- [ ] **Step 2: Implement device work and command fallbacks**

Create Netmiko connections with bounded timeouts and `fast_cli: false`. Use `show vlan brief` then `show vlan` fallback. Try the documented environment commands and supported resource commands. Preserve feature-specific completeness so valid monitor payloads publish even if endpoint commands fail.

- [ ] **Step 3: Write failing publisher tests**

Mock `requests.Session.post` and `time.sleep`. Verify exact route mapping, bearer header, JSON body, finite timeout, exponential retry for exceptions/429/5xx, no retry for 4xx, 200 duplicate handling, 201 create handling, and sanitized errors.

- [ ] **Step 4: Implement publishing and summaries**

Keep a single run ID per invocation and reuse it for HTTP retries. Let each device worker disconnect before publishing its complete payloads. Aggregate selected, connected, collected, published, duplicate, and failed counts. Return exit code 1 for any failure and 0 only for complete success.

- [ ] **Step 5: Write failing pool tests and implement orchestration**

Patch `ThreadPoolExecutor` to capture `max_workers`; assert the default is 20, overrides are honored, overlapping `all` devices submit once, and one worker exception does not cancel others.

- [ ] **Step 6: Run collector tests and CLI regression tests**

Run:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_legacy_sync.py -q
PYTHONPATH=src .venv/bin/python -m pytest -q \
  --deselect=tests/test_endpoints_aci.py::test_build_interface_inventory_maps_oper_detail_from_ethpm \
  --deselect=tests/test_endpoints_aci.py::test_build_interface_inventory_uses_port_channel_oper_status_not_channel_mode
```

Expected: new tests pass; the existing suite excluding the documented two-test baseline file passes.

- [ ] **Step 7: Commit complete standalone collector**

```bash
git add legacy_sync.py tests/test_legacy_sync.py
git commit -m "feat: publish legacy snapshots with pooled SSH"
```

### Task 9: Configuration documentation and end-to-end verification

**Repository:** `netroku-aci` unless a command says otherwise.

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-07-21-legacy-device-ingestion-design.md` only if implementation names differ from the approved contract.

**Interfaces:**
- Documents server `LEGACY_INGEST_TOKEN`, collector `NETROKU_BASE_URL`, collector `NETROKU_LEGACY_INGEST_TOKEN`, default asset paths, modes, worker control, API routes, and deployment/migration commands.

- [ ] **Step 1: Add environment and operations documentation**

Add to `.env.example`:

```dotenv
# Bearer token accepted by POST /api/ingest/legacy/*.
# Generate with: openssl rand -hex 32
LEGACY_INGEST_TOKEN=
```

Document installation/runtime prerequisites, inventory formats, all three collector modes, path overrides, the default 20 workers, example scheduler commands, and the rule that private files remain gitignored.

- [ ] **Step 2: Run backend format, generated-client, focused, and full checks**

Run:

```bash
bunx prisma format
bunx prisma validate
bunx prisma generate
bun test src/lib/schemas/legacy-ingest.test.ts src/lib/legacy-ingest
bun test
bunx tsc --noEmit
bun run lint
```

Expected: all commands exit 0 and the full suite has at least the baseline 291 passing tests plus the new legacy tests.

- [ ] **Step 3: Run collector verification**

In `netroku-cli`, run:

```bash
python3 -m py_compile legacy_sync.py
PYTHONPATH=src .venv/bin/python -m pytest tests/test_legacy_sync.py -q
PYTHONPATH=src .venv/bin/python -m pytest -q \
  --deselect=tests/test_endpoints_aci.py::test_build_interface_inventory_maps_oper_detail_from_ethpm \
  --deselect=tests/test_endpoints_aci.py::test_build_interface_inventory_uses_port_channel_oper_status_not_channel_mode
```

Expected: compile passes, all new tests pass, and the regression suite excluding the documented pre-existing failures passes.

- [ ] **Step 4: Inspect both branches and secret safety**

Run in both repositories:

```bash
git diff --check
git status --short
```

Also search changed files for literal credentials, tokens, private IP fixtures outside tests, and accidental F5/config/template additions. Expected: no secrets or private runtime assets are tracked.

- [ ] **Step 5: Commit documentation**

```bash
git add .env.example README.md
git commit -m "docs: document legacy ingestion operations"
```

- [ ] **Step 6: Record final branch state**

Confirm both repositories are on `feat/legacy-device-ingestion`, working trees are clean, and list each repository's commits for review. Do not push or open a PR without a separate user request.
