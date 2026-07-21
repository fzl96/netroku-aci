# Legacy Device Ingestion Design

**Date:** 2026-07-21
**Status:** Approved for implementation planning

## Objective

Extend the `netroku-aci` backend so it can store current state and full history for legacy network devices without making the Next.js application connect to those devices directly.

A standalone Python collector will run beside the existing `netroku-cli` deployment, where the private credential files, F5 ARP logs, and locally customized TextFSM templates already exist. The collector will connect to devices over SSH, normalize the results, and publish one device at a time to authenticated ingestion APIs in `netroku-aci`.

The work must not change existing `netroku-cli` commands, reports, package behavior, ACI resync routes, or ACI database tables.

## Scope

This phase includes:

- One standalone Python file named `legacy_sync.py` at the root of the deployed `netroku-cli` checkout.
- Combined health and physical-interface collection in one SSH session.
- Endpoint collection for a separately selected subset of devices.
- A default pool of 20 concurrent device workers.
- Three versioned, machine-authenticated ingestion APIs.
- Dedicated normalized legacy-device tables in PostgreSQL.
- Current-state reconciliation, append-only health/interface samples, endpoint placement history, idempotency, and machine audit records.
- Unit, route, persistence, collector, and regression tests.

This phase excludes:

- UI changes or combined ACI/legacy views.
- Changes to existing `netroku-cli` commands.
- Direct SSH connections from `netroku-aci`.
- Credential storage in `netroku-aci`.
- History retention or pruning jobs. History is retained indefinitely.
- Generalizing `ApicHost` or existing ACI tables into cross-platform models.

## System Boundary

```text
netroku-cli runtime host
  legacy_sync.py
  private CSV inventories
  private F5 ARP logs
  customized ntc_templates
          |
          | HTTPS + bearer token
          v
netroku-aci
  versioned Zod schemas
  legacy ingestion routes
  legacy persistence services
          |
          v
PostgreSQL dedicated legacy tables
```

The Python collector owns SSH, command execution, TextFSM parsing, and payload normalization. The TypeScript application owns authentication, contract validation, device identity, reconciliation, history, and database transactions.

Device usernames, passwords, enable secrets, and the bearer token must never appear in an ingestion payload, persisted audit payload, or normal log output.

## Standalone Collector

### Location and independence

The collector is a single regular file:

```text
netroku-cli/legacy_sync.py
```

It is not registered as a Typer command and does not modify or import the `netroku_cli` package. It may depend on Netmiko and the TextFSM/NTC support already installed for the existing runtime. All collector-specific parsing, validation, HTTP publishing, retry, and orchestration code lives in the file.

Keeping the file beside the deployed runtime lets it use private, gitignored assets without copying them into `netroku-aci`.

### Modes

The file supports three modes:

```bash
python legacy_sync.py monitor
python legacy_sync.py endpoint
python legacy_sync.py all
```

- `monitor` reads the monitor inventory and collects device metadata, health, logs, and physical interfaces in one SSH session per device.
- `endpoint` reads the endpoint inventory and collects interface, MAC, VLAN, switchport, and endpoint data. F5 ARP files enrich MAC records with IP addresses.
- `all` loads both inventories. If a device is present in both, the collector opens one SSH session and runs the union of monitor and endpoint commands. Each feature is still normalized and published independently.

One invocation creates one UUID `run_id`. All feature payloads produced by that invocation share it. Every payload has its own feature-specific idempotency key on the server.

### Default inputs

Paths resolve relative to the directory containing `legacy_sync.py`, not the caller's current working directory:

| Input | Default |
|---|---|
| Monitor inventory | `configs/interfaces/legacy_creds.csv` |
| Endpoint inventory | `configs/endpoint/legacy_creds.csv` |
| F5 ARP logs | `configs/endpoint/logs/f5` |
| Customized templates | `ntc_templates` |

All paths can be overridden:

```bash
python legacy_sync.py all \
  --monitor-creds configs/interfaces/legacy_creds.csv \
  --endpoint-creds configs/endpoint/legacy_creds.csv \
  --f5-logs configs/endpoint/logs/f5 \
  --ntc-templates ntc_templates \
  --workers 20
```

Inventories use the existing headerless, semicolon-separated shape:

```text
site;hostname;management_ip;device_type;username;password
```

The collector sets `NET_TEXTFSM` to the resolved customized template directory before creating any Netmiko connection. It must fail before collection if the template directory or required inventory is missing. A missing F5 directory is allowed and produces endpoints with `ip: null`; it is reported as a warning rather than a collection failure.

### Configuration

The API configuration is environment-only for secrets:

```bash
export NETROKU_BASE_URL="https://netroku.example.com"
export NETROKU_LEGACY_INGEST_TOKEN="..."
```

The collector refuses to start if either variable is absent. HTTPS certificate verification is enabled by default. Deployment-specific CA trust should be configured through the host Python trust store rather than by silently disabling verification.

### Concurrency and SSH lifecycle

Device work runs in a bounded pool with 20 workers by default. `--workers` accepts a positive integer; zero and negative values are rejected.

Each worker owns at most one device connection at a time. It connects, runs the commands required by that device's selected modes, normalizes feature results, disconnects in a `finally` block, and then publishes its complete feature payloads from that same worker. A failure for one device or one feature does not cancel other devices.

For `all`, a device appearing in both inventories must have matching connection identity fields. Conflicting management IP or device type values are a validation error for that device and no connection is attempted. Credentials are taken from the monitor inventory after the identity fields agree.

F5 ARP text files are read once before endpoint workers start. Every `*.txt` file under the configured directory is parsed into one shared, read-only canonical MAC-to-IP lookup.

Because collection and publication share the same device-worker pool, total concurrent device tasks never exceed `--workers`.

### Collection completeness

Completeness is determined separately for health, interfaces, and endpoints.

- A successful SSH connection is not sufficient by itself.
- A feature is complete only when all commands required to build that feature returned parseable results.
- A successful command with zero legitimate rows is a complete empty snapshot.
- A timeout, unsupported command without a defined fallback, raw unparsed response, or parser exception makes that feature incomplete.
- Incomplete feature payloads are not sent, so they cannot mark stored records absent.
- In `all`, complete health and interface payloads may still be sent when endpoint-specific commands fail, and the reverse is also allowed when feature requirements are independently satisfied.

## API Contracts

### Routes

```text
POST /api/ingest/legacy/health
POST /api/ingest/legacy/interfaces
POST /api/ingest/legacy/endpoints
```

Each request describes exactly one device and one feature. Requests use:

```http
Authorization: Bearer <NETROKU_LEGACY_INGEST_TOKEN>
Content-Type: application/json
```

The server reads the expected value from `LEGACY_INGEST_TOKEN`. This token is distinct from `SCHEDULER_TOKEN`. Comparison is timing-safe. A missing server token makes the ingestion routes unavailable rather than accepting unauthenticated requests.

### Common envelope

```json
{
  "schema_version": 1,
  "run_id": "18d187a6-6509-40bd-b246-cc3798780efa",
  "collected_at": "2026-07-21T14:30:00+07:00",
  "complete": true,
  "device": {
    "site": "jakarta",
    "hostname": "SW-JKT-01",
    "management_ip": "10.10.0.11",
    "device_type": "cisco_ios",
    "vendor": "Cisco",
    "model": "C9300-48P",
    "serial_number": "FCW12345678",
    "software_version": "17.9.4a",
    "location": "Jakarta DC, Row A"
  }
}
```

`site`, `hostname`, `management_ip`, and `device_type` are required. The remaining device inventory fields are optional. Omitted optional metadata does not erase an existing value. Empty strings are normalized to omission for optional metadata.

Only `schema_version: 1` is accepted in this phase. `run_id` must be a UUID, `collected_at` must include an offset, and `complete` must be `true`. Incomplete collections are never submitted.

### Health payload

The health envelope adds:

```json
{
  "health": {
    "uptime": "2 years, 14 weeks, 3 days",
    "cpu_percent": 18,
    "memory_percent": 64.25,
    "storage_percent": 41.8,
    "temperature_celsius": 38,
    "fan_statuses": ["OK"],
    "psu_statuses": ["OK"]
  },
  "logs": [
    {
      "timestamp": "2026-07-21T14:20:10+07:00",
      "severity": "ERROR",
      "message": "Interface GigabitEthernet1/0/2 changed state to down",
      "raw": "%LINK-3-UPDOWN: Interface GigabitEthernet1/0/2 changed state to down"
    }
  ]
}
```

Percentage values are numbers from 0 through 100. Temperature may be `null` when unavailable. Status arrays may be empty. Logs are bounded to the most recent 500 parsed entries per payload.

Health does not transmit MAC, ARP, routing, or interface tables. The collector may use interface results internally, but canonical interface persistence occurs only through the interface route.

### Interface payload

The interface envelope adds:

```json
{
  "interfaces": [
    {
      "name": "GigabitEthernet1/0/1",
      "description": "User access port",
      "ip_address": null,
      "prefix_length": null,
      "mtu": 1500,
      "speed": "1000 Mb/s",
      "admin_state": "up",
      "oper_state": "up",
      "input_errors": "0",
      "output_errors": "0",
      "crc_errors": "0"
    }
  ]
}
```

This collector includes physical interfaces only. NVE, VLAN SVI, subinterface, tunnel, and loopback interfaces are excluded. Counters are non-negative base-10 strings so they remain exact across Python, JSON, JavaScript, and PostgreSQL `BIGINT`. `mtu` and `prefix_length` are nullable integers.

An interface payload is limited to 20,000 rows for one device.

### Endpoint payload

The endpoint envelope adds a flat list:

```json
{
  "endpoints": [
    {
      "mac": "00:11:22:33:44:55",
      "ip": "10.10.10.25",
      "interface": "GigabitEthernet1/0/1",
      "vlan": "10",
      "vlan_name": "USERS",
      "learning_type": "dynamic"
    }
  ]
}
```

MAC addresses are lowercase colon-separated values. Unknown IPs are `null`, never `"N/A"`. Interface names are canonicalized before identity matching. Endpoint list order has no semantic meaning and is sorted deterministically by the collector before transmission.

An endpoint payload is limited to 100,000 rows for one device. Payloads over a route's feature limit return HTTP 413 before persistence.

### Responses

A new ingestion returns HTTP 201. An identical idempotent retry returns HTTP 200. Both return:

```json
{
  "receipt_id": "...",
  "duplicate": false,
  "device_id": "...",
  "counts": {
    "inserted": 0,
    "updated": 0,
    "cleared": 0,
    "samples": 0
  }
}
```

Errors use a stable `{ "error": "..." }` body and these statuses:

- 400 for malformed JSON.
- 401 for a missing or invalid bearer token.
- 409 when an idempotency key is reused with different canonical content.
- 413 when configured collection limits are exceeded.
- 422 for a structurally valid JSON body that violates the versioned schema.
- 500 for unexpected persistence failures.
- 503 when `LEGACY_INGEST_TOKEN` is not configured on the server.

## Database Design

Dedicated legacy models preserve the existing ACI schema.

### `LegacyDevice`

Stores the current device identity and inventory:

- Internal CUID/UUID primary key.
- Display `site` and `hostname`.
- Normalized lowercase/trimmed `siteKey` and `hostnameKey` with a unique compound constraint.
- Mutable management IP and device type.
- Optional vendor, model, serial number, software version, and location.
- Active flag and first/last-seen timestamps.
- Last successful health, interface, and endpoint ingestion timestamps.

The API automatically creates or updates this row during ingestion. `site + hostname` is the external lookup identity; all related records use the internal database ID. IP, type, and supplied optional inventory fields may change without losing history.

Successful ingestion sets `active` to true. This phase does not infer that an entire device is inactive from the absence of a per-device request; administrative device deactivation is reserved for later management work.

### `LegacyIngestReceipt`

Stores one authoritative ingestion receipt per `runId + deviceId + feature`:

- Feature is `health`, `interfaces`, or `endpoints`.
- Collected and received timestamps.
- Canonical payload hash.
- Inserted, updated, cleared, and sample counts.

The compound identity is unique. The server hashes a stable, key-sorted representation of the validated payload; array ordering remains significant, so the collector sorts set-like arrays deterministically.

An automatic HTTP retry reuses the same run ID and returns the original receipt without inserting duplicate samples. Starting the script again creates a new run ID and therefore represents a new observation, not an idempotent retry.

### `LegacyHealthSample`

Append-only, one row per successful health receipt:

- Device and receipt foreign keys.
- Collected timestamp.
- Uptime text.
- Nullable CPU, memory, storage, and temperature values.
- PostgreSQL string arrays for fan and PSU statuses.

Inventory attributes such as serial, model, and software version belong to `LegacyDevice`, not each sample.

### `LegacyLogEntry`

Stores parsed health logs with device, receipt, event timestamp, severity, normalized message, raw message, and event hash. Logs with an original timestamp are deduplicated by device plus a hash of the timestamp and raw event. Events without a parseable original timestamp include the receipt ID in the hash so legitimate later observations are retained.

### `LegacyInterfaceSnapshot`

Stores the latest known state of each physical interface:

- Device foreign key and normalized interface key with a unique compound constraint.
- Display name, description, IP/prefix, MTU, speed, admin state, and operational state.
- Present flag and first/last-seen timestamps.

A complete interface ingestion upserts every received interface and marks previously present omitted interfaces absent. Rows are never deleted by ingestion.

### `LegacyInterfaceSample`

Append-only, one row per interface per successful interface receipt:

- Interface, device, and receipt foreign keys.
- Collected timestamp.
- Admin/oper state, speed, input errors, output errors, and CRC counters.
- Nullable deltas for each counter.

Deltas are computed on the server against the latest previous sample for the same interface. The first sample has null deltas. A decreased counter indicates a reboot or counter clear and also produces a null delta rather than a negative value.

### `LegacyEndpoint`

Stores endpoint placement and lifecycle history:

- Device foreign key.
- Canonical MAC, nullable IP, VLAN, VLAN name, interface, and learning type.
- Active flag, first/last-seen timestamps, and nullable cleared timestamp.

Within a device, MAC plus normalized IP identifies an endpoint, with null represented by an internal empty comparison key. If the same endpoint remains at the same interface/VLAN placement, its last-seen timestamp is updated. If its placement changes, the active row is cleared and a new active placement row is created. Active endpoints missing from a complete payload are cleared. Historical placement rows are retained.

A PostgreSQL partial unique index enforces at most one active row per device and endpoint identity.

## Transaction and Reconciliation Rules

Each device-feature request is validated before its database transaction starts. Inside one transaction the server:

1. Finds or creates the normalized `LegacyDevice`.
2. Checks the feature idempotency key.
3. Returns the stored result if the key and hash match.
4. Returns 409 without writes if the key exists with different content.
5. Updates supplied device metadata without erasing omitted values.
6. Applies the feature-specific snapshot and history writes.
7. Creates the ingestion receipt and updates the device's feature timestamp.

Any persistence failure rolls back that complete device-feature operation. Other devices and features are unaffected.

The existing `AuditLog` records machine actions named `ingest.legacy.health`, `ingest.legacy.interfaces`, and `ingest.legacy.endpoints`. Audit details include run ID, device, feature, outcome, and counts, but not full payloads or secrets. The ingest receipt remains the authoritative technical record if auxiliary audit recording fails.

## Collector Failure and Retry Behavior

The collector uses bounded connect and response timeouts. It retries network failures, HTTP 429, and HTTP 5xx responses with exponential backoff, reusing the same payload and run ID. It does not retry 400, 401, 409, 413, or 422 responses.

Collection or upload failure for one device does not stop other workers. At completion the script prints counts for devices selected, connected, collected by feature, published by feature, duplicates, and failures. It exits nonzero if any selected device has a collection or publication failure.

The collector must not log credential dictionaries, request authorization headers, or raw payloads containing operational data at normal verbosity. Error messages identify site, hostname, feature, stage, and a sanitized reason.

## Testing Strategy

### Collector tests

- Headerless semicolon inventory parsing and malformed-row rejection.
- Relative and overridden asset path resolution.
- Missing required templates/inventories and optional missing F5 directory.
- F5 ARP parsing across multiple text files, incomplete entries, and MAC normalization.
- IOS and NX-OS monitor parsing fixtures.
- Physical-interface filtering and enhanced counter fields.
- Endpoint flattening, VLAN enrichment, null IP behavior, and deterministic sorting.
- `all` inventory merging, credential/identity conflicts, and one connection per overlapping device.
- Default 20-worker behavior, worker validation, isolated device failures, and guaranteed disconnect.
- HTTP authentication headers, timeouts, retryable/non-retryable statuses, idempotent retry, summaries, and exit codes.
- A secret-redaction assertion for captured logs.

The standalone file should keep functions import-safe behind a `main()`/`if __name__ == "__main__"` boundary so tests can load it without running collection.

### Backend tests

- Timing-safe token authentication and missing-token behavior.
- Zod validation for all envelopes, schema version, percentages, timestamps, counters, MACs, and nullable fields.
- Automatic device registration, normalized identity, metadata updates, and omission preservation.
- Canonical hashing, identical duplicate requests, and conflicting duplicate requests.
- Health sample and log persistence/deduplication.
- Interface upsert, absence reconciliation, sample insertion, and counter reset/delta rules.
- Endpoint unchanged placement, movement, disappearance, empty complete snapshots, and active-row uniqueness.
- Per-device transaction rollback.
- Route response codes and count bodies.
- Existing ACI route, schema, and application test suites.

### Acceptance criteria

The design is implemented successfully when:

1. `python legacy_sync.py monitor`, `endpoint`, and `all` run without registering new `netroku-cli` commands.
2. Monitor collection obtains health and physical-interface data through one SSH connection per device.
3. `all` uses one connection for a device present in both inventories.
4. Collection uses at most the configured workers and defaults to 20.
5. Customized local TextFSM templates and private F5 logs are used through the documented paths.
6. Successful devices publish independently to the three authenticated APIs.
7. Duplicate HTTP retries do not duplicate historical samples.
8. PostgreSQL exposes current legacy device/interface/endpoint state and complete health/interface/endpoint history.
9. Failed or incomplete collections never clear previously stored state.
10. Existing CLI behavior and existing ACI backend behavior remain unchanged.
