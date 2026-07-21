# ACI Toolkit

A Next.js web app for bulk provisioning Cisco ACI access policy and fabric bindings via CSV upload. Built for network engineers who need to stand up port policy and static port bindings without touching the APIC GUI.

## Features

- **CSV drag-and-drop** — upload a spreadsheet, get instant validation feedback before anything is sent to APIC
- **Deploy + Rollback** — every feature includes a rollback flow using the same CSV
- **EPG + contract workflows** — create EPGs, bind them to bridge domains, and attach consumed/provided contracts
- **Parallel execution** — 10 concurrent checks during validate, 5 during deploy
- **Session-aware** — detects expired APIC tokens and prompts reconnect
- **TLS bypass** — works with self-signed APIC certificates out of the box

## Running It On Your Own System

The app is a standard Next.js 16 project backed by a local Postgres database (via Prisma). The steps below cover a full setup from a clean machine. Commands are shown for **Bun**; the **Node/npm** equivalents are listed in the callout afterwards.

### Prerequisites

- **Bun** ≥ 1.1 ([install](https://bun.sh)) — or **Node.js** ≥ 20 with npm
- **Git**
- **Docker** with Docker Compose
- An empty directory for the project

> **Windows users:** Bun on Windows has a known compatibility issue with the TLS bypass library used to talk to self-signed APICs. Use **WSL2** or **Node.js** instead.

### 1. Install a runtime

Install Bun (recommended) or Node.js 20+. Verify:

```bash
bun --version    # or: node --version
```

### 2. Clone the repository

```bash
git clone <repo-url> netroku-aci
cd netroku-aci
```

### 3. Install dependencies

```bash
bun install
```

### 4. Create the environment file

Copy the example and fill in the values:

```bash
cp .env.example .env
```

| Variable                            | Required          | Purpose                                                                                                                |
| ----------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | yes               | Postgres connection string. For local Docker, use `postgresql://netroku:netroku@localhost:5432/netroku?schema=public`. |
| `BETTER_AUTH_SECRET`                | yes               | Session signing secret. Generate with `openssl rand -hex 32`.                                                          |
| `BETTER_AUTH_URL`                   | yes               | Base URL the app is served from (e.g. `http://localhost:3000`).                                                        |
| `NEXT_PUBLIC_APP_URL`               | yes               | Public base URL used by the browser.                                                                                   |
| `TRUSTED_ORIGINS`                   | yes               | Comma-separated origins Better Auth accepts (add LAN IPs / Tailscale hosts here).                                      |
| `SECURE_COOKIES`                    | no                | Set to `true` **only** when served exclusively over HTTPS. Leave blank for HTTP/LAN.                                   |
| `ENCRYPTION_KEY`                    | yes               | 64-char hex (32 bytes) used by `src/lib/crypto.ts`. Generate with `openssl rand -hex 32`.                              |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | yes (for seeding) | First admin account created by the seed script. Password ≥ 8 chars.                                                    |
| `SCHEDULER_TOKEN`                   | no                | Bearer token an external scheduler must send to `POST /api/cron/resync`. Generate with `openssl rand -hex 32`.         |

### 5. Start Postgres

```bash
docker compose up -d
```

### 6. Apply the migrations and generate the Prisma client

This creates every table from the committed migration files and generates the Prisma client:

```bash
bun run db:setup
```

### 7. Optional: migrate legacy SQLite data

If you have an old `prisma/dev.db` to import:

1. Generate the read-only SQLite client: `bunx prisma generate --schema=prisma/schema.sqlite.prisma`
2. Run the copy: `bun run migrate:data`

The script refuses to run if the destination tables are non-empty. Skip this step on a fresh install.

### 8. Seed the first admin user

Reads `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env` and creates an admin account:

```bash
bun run seed:admin
```

### 9. Build and start (production)

```bash
bun run build
bun run start
```

### …or run in development mode

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with the seeded admin credentials.

> **Using Node/npm instead of Bun:** replace `bun install` → `npm install`, `bun run dev` → `npm run dev`, `bun run build` → `npm run build`, `bun run start` → `npm run start`, and so on. Every command above maps to the matching `package.json` script.

### Rollback to SQLite

`prisma/dev.db` is left untouched by the migration. To revert:

1. In `prisma/schema.prisma`, set `provider = "sqlite"`.
2. Set `DATABASE_URL="file:./dev.db"` in `.env`.
3. Restore the SQLite migrations from git history, or revert the cutover commit.
4. Run `bun run prisma:generate`.

### Connecting an APIC

The app never bundles APIC credentials. After signing in:

1. Go to **APIC Hosts** and add a controller (a friendly name + the APIC IP/hostname).
2. On any monitoring page, click **Resync** and enter the APIC username/password for that pull. Credentials are used for that single request only — they are **not persisted** to the database.
3. APIC session tokens expire after **600 seconds** (10 minutes) by default; reconnect if requests start returning 401.

## Legacy Device Ingestion

Legacy IOS/NX-OS data is collected outside the Next.js application by the standalone `legacy_sync.py` file in the companion `netroku-cli` checkout. The web application never stores device credentials and never opens SSH sessions to network devices.

### Server configuration

Generate a dedicated ingestion token and add it to the `netroku-aci` environment:

```bash
openssl rand -hex 32
```

```dotenv
LEGACY_INGEST_TOKEN=<generated-token>
```

Apply the database migration and regenerate Prisma before starting the updated application:

```bash
bun run prisma:deploy
bun run prisma:generate
```

The version-1 machine endpoints are:

```text
POST /api/ingest/legacy/health
POST /api/ingest/legacy/interfaces
POST /api/ingest/legacy/endpoints
```

Every request represents one complete feature snapshot for one device and must send `Authorization: Bearer <LEGACY_INGEST_TOKEN>`. Requests are idempotent by run ID, device, and feature. Incomplete collections are not submitted and therefore cannot clear stored state.

### Collector configuration

On the host containing `netroku-cli`, export the application base URL and the same token under the collector-specific name:

```bash
export NETROKU_BASE_URL="https://netroku.example.com"
export NETROKU_LEGACY_INGEST_TOKEN="<generated-token>"
```

Run one of the standalone modes:

```bash
python legacy_sync.py monitor
python legacy_sync.py endpoint
python legacy_sync.py all
```

`monitor` collects health and physical interfaces in one SSH session per device. `endpoint` uses the smaller endpoint inventory and F5 ARP logs. `all` merges both inventories and uses one SSH session for overlapping devices. Collection defaults to 20 workers and can be limited with `--workers`.

Default private/runtime paths are relative to `legacy_sync.py`:

| Input | Default path |
|---|---|
| Monitor inventory | `configs/interfaces/legacy_creds.csv` |
| Endpoint inventory | `configs/endpoint/legacy_creds.csv` |
| F5 ARP logs | `configs/endpoint/logs/f5/*.txt` |
| Customized TextFSM templates | `ntc_templates/` |

Override any path when deployments use a different layout:

```bash
python legacy_sync.py all \
  --monitor-creds /srv/netroku/configs/monitor.csv \
  --endpoint-creds /srv/netroku/configs/endpoints.csv \
  --f5-logs /srv/netroku/configs/f5 \
  --ntc-templates /srv/netroku/ntc_templates \
  --workers 20
```

Credential CSVs remain headerless and semicolon-separated:

```text
site;hostname;management_ip;device_type;username;password
```

Keep inventories, F5 output, customized private templates, and tokens out of source control. The collector prints a final selected/connected/collected/published/failure summary and exits nonzero if any device feature fails.

---

## Static Ports

Bulk deploy/rollback `fvRsPathAtt` bindings (VLAN/port bindings on EPGs).

### Validation checks (per row)

1. EPG exists in APIC
2. Leaf nodes are registered in the fabric
3. Port / IPG exists in the fabric
4. VLAN encap not already in use on that port by a different EPG
5. Static port binding not already deployed (idempotent `exists` status)

### CSV Format

| Column             | Description                                        | Example                          |
| ------------------ | -------------------------------------------------- | -------------------------------- |
| `tenant`           | Tenant name                                        | `serverfarm`                     |
| `ap`               | Application Profile name                           | `DC2-SERVERFARM-AP`              |
| `epg`              | EPG name                                           | `VLAN1411_EPG`                   |
| `vlan`             | VLAN encap (1–4094)                                | `1411`                           |
| `node1`            | Primary leaf node ID                               | `3101`                           |
| `node2`            | Secondary leaf node ID (vpc only, blank otherwise) | `3102`                           |
| `port_type`        | `vpc`, `pc`, or `port`                             | `vpc`                            |
| `interface_or_ipg` | IPG name (vpc/pc) or interface (port)              | `DC2-SVR-LEAF-3101-3102-VPC-IPG` |
| `mode`             | `regular` (tagged), `native`, or `untagged`        | `regular`                        |
| `immediacy`        | `immediate` or `lazy`                              | `immediate`                      |

### Example

```csv
tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy
serverfarm,DC2-SERVERFARM-AP,VLAN1411_EPG,1411,3101,3102,vpc,DC2-SVR-LEAF-3101-3102-VPC-IPG,regular,immediate
serverfarm,DC2-SERVERFARM-AP,VLAN1412_EPG,1412,3101,3102,vpc,DC2-SVR-LEAF-3101-3102-VPC-IPG,regular,immediate
TenantB,App2-AP,Front-EPG,300,101,,pc,Bundle-101,regular,immediate
TenantA,App1-AP,Mgmt-EPG,999,103,,port,1/10,untagged,immediate
```

---

## Interface Selectors

Bulk deploy/rollback `infraHPortS` + `infraPortBlk` + `infraRsAccBaseGrp` objects — the access policy that binds a physical port on a leaf to an IPG. One row = one port = one selector.

### Validation checks (per row)

1. Interface profile exists in APIC
2. IPG exists at the correct DN for the declared type
3. Port not already claimed by another selector on the same profile
4. Selector name not already in use with a different port/IPG (hard error)
5. Selector already exists with identical port + IPG → `exists` (idempotent, skipped)

### CSV Format

| Column              | Description                                        | Example             |
| ------------------- | -------------------------------------------------- | ------------------- |
| `interface_profile` | Existing `infraAccPortP` name                      | `leaf101-intf-prof` |
| `selector_name`     | Unique per profile — no slashes                    | `eth1-1`            |
| `port`              | Cisco notation `card/port`                         | `1/1`               |
| `ipg_name`          | Interface Policy Group name                        | `leaf101-ipg`       |
| `ipg_type`          | `port`, `pc`, or `vpc`                             | `port`              |
| `description`       | Optional — applied to both selector and port block | `Uplink to spine`   |

> **Note:** `selector_name` must contain only letters, numbers, hyphens, and underscores. Slashes are not valid in APIC RN values.

### Example

```csv
interface_profile,selector_name,port,ipg_name,ipg_type,description
leaf101-intf-prof,eth1-1,1/1,leaf101-ipg,port,Uplink to spine
leaf101-intf-prof,eth1-2,1/2,leaf101-pc-ipg,pc,vPC member
leaf102-intf-prof,eth1-1,1/1,leaf101-leaf102-vpc-ipg,vpc,
```

---

## Bridge Domains

Bulk deploy and rollback bridge domains from CSV. L2-only rows create or delete an `fvBD` with fixed L2 behavior. L3 rows create/delete the bridge domain; APIC removes child subnet and L3Out relations when the parent BD is deleted.

### L2 Only Defaults

| Attribute        | Value               |
| ---------------- | ------------------- |
| `unkMacUcastAct` | `flood`             |
| `arpFlood`       | `true`              |
| `unicastRoute`   | `no`                |
| `mac`            | `00:22:BD:F8:19:FF` |

### L2 Only CSV Format

| Column    | Description          | Example            |
| --------- | -------------------- | ------------------ |
| `tenant`  | Existing tenant name | `TenantA`          |
| `bd`      | Bridge Domain name   | `VLAN1411-BD`      |
| `vrf`     | Existing VRF name    | `TenantA-VRF`      |
| `bd_desc` | Optional description | `L2 bridge domain` |

```csv
tenant,bd,vrf,bd_desc
TenantA,VLAN1411-BD,TenantA-VRF,L2 bridge domain
```

### L3 Defaults

| Attribute        | Value               |
| ---------------- | ------------------- |
| `unkMacUcastAct` | `proxy`             |
| `arpFlood`       | `false`             |
| `unicastRoute`   | `yes`               |
| `mac`            | `00:22:BD:F8:19:FF` |
| Subnet `scope`   | `public`            |

### L3 CSV Format

| Column    | Description                                    | Example            |
| --------- | ---------------------------------------------- | ------------------ |
| `tenant`  | Existing tenant name                           | `TenantA`          |
| `bd`      | Bridge Domain name                             | `VLAN1411-BD`      |
| `vrf`     | Existing VRF name                              | `TenantA-VRF`      |
| `subnet`  | Bridge Domain gateway subnet in IPv4 CIDR form | `10.14.11.1/24`    |
| `l3out`   | Existing L3Out name in the same tenant         | `WAN-L3OUT`        |
| `bd_desc` | Optional description                           | `L3 bridge domain` |

```csv
tenant,bd,vrf,subnet,l3out,bd_desc
TenantA,VLAN1411-BD,TenantA-VRF,10.14.11.1/24,WAN-L3OUT,L3 bridge domain
```

---

## EPGs

Bulk deploy and rollback `fvAEPg` objects under existing tenants and application profiles. Each row creates or updates one EPG, binds it to an existing bridge domain, and can attach multiple consumed (`fvRsCons`) and provided (`fvRsProv`) contracts.

By default, the Bridge Domain and contracts are expected to live in the same tenant as the EPG. For shared-object cases, use `bd_tenant=common` for a BD in `common` and `contract_tenant=common` for consumed/provided contracts in `common`. If the EPG should be usable for physical static bindings, provide `phys_domain` to bind a physical domain to the EPG.

### Validation checks (per row)

1. Tenant exists in APIC
2. Application Profile / ANP exists in the tenant
3. Bridge Domain exists in the EPG tenant, or in `common` when `bd_tenant=common`
4. Optional consumed/provided contracts exist in the EPG tenant, or in `common` when `contract_tenant=common`
5. Optional physical domain exists when `phys_domain` is provided
6. Existing EPG is either reusable with the same Bridge Domain, or rejected if it points to a different Bridge Domain
7. Existing contract and physical domain relations are treated as idempotent; missing relations are queued for deploy

For rollback, rows with contract columns remove only the selected consumed/provided contract relations. Rows without contract columns delete the EPG itself.

### CSV Format

| Column            | Description                                                                                                 | Example                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| `tenant`          | Existing tenant name                                                                                        | `TenantA`                   |
| `anp`             | Existing Application Profile / ANP name (`ap` is also accepted)                                             | `APP-A`                     |
| `epg`             | EPG name to create, update, or remove                                                                       | `WEB-EPG`                   |
| `bd_tenant`       | Optional BD tenant. Empty defaults to `tenant`; only `common` is supported for shared BD lookup             | `common`                    |
| `bd`              | Existing Bridge Domain name to bind                                                                         | `WEB-BD`                    |
| `phys_domain`     | Optional physical domain to bind to the EPG (`physdom` is also accepted)                                    | `MSI-PHYS-DOM`              |
| `contract_tenant` | Optional contract tenant. Empty defaults to `tenant`; only `common` is supported for shared contract lookup | `common`                    |
| `cons_contract`   | Optional comma-separated consumed contracts                                                                 | `WEB-CONTRACT,API-CONTRACT` |
| `prov_contract`   | Optional comma-separated provided contracts                                                                 | `DB-CONTRACT`               |
| `epg_desc`        | Optional EPG description                                                                                    | `Web frontend EPG`          |

### Example

```csv
tenant,anp,epg,bd_tenant,bd,phys_domain,contract_tenant,cons_contract,prov_contract,epg_desc
TenantA,APP-A,WEB-EPG,,WEB-BD,,,"WEB-CONTRACT,API-CONTRACT",,Web frontend EPG
TenantA,APP-A,DB-EPG,,DB-BD,MSI-PHYS-DOM,,,DB-CONTRACT,Database EPG
SERVERFARM,APP-SERVERFARM,SHARED-EPG,common,SHARED-BD,MSI-PHYS-DOM,common,MSI-CRITICAL-NS-CT,,EPG using shared BD and contract from common
```

---

## Monitoring & Health Checks

Beyond provisioning, the app polls each registered APIC and stores the results in Postgres so the dashboard and per-feature pages can render history and trends without hitting the controller on every page load.

### How a sync works

Every monitoring page has a **Resync** action that calls its own route handler (`POST /api/<feature>/resync`). The handler logs into APIC (`aaaLogin`), queries one or more managed-object **classes** over the REST API, and writes the parsed rows into the database. Two shapes of data are persisted per feature:

- **Snapshot tables** — the current state of each object, upserted on `(apicHostId, dn)`. A row's `firstSeenAt` / `lastSeenAt` (and `present` / `lifecycle` / `isActive`) track appearance and disappearance across syncs rather than being deleted.
- **Sample tables** — a timestamped aggregate row appended on every sync, used to draw trend charts (e.g. `NodeStatusSample`, `InterfaceSample`).

The **EPGs** page uses a third shape: it holds no history at all. Each sync deletes and recreates every `EpgSnapshot` / `EpgPathBinding` row for the host in a single bulk-replace transaction, so the table is always a mirror of the current APIC state.

An external scheduler can drive all features for one or more hosts at once via `POST /api/cron/resync` (authorized with the `SCHEDULER_TOKEN` bearer header). Every sync is written to the `AuditLog` table and surfaced on the **History** page.

> **Credentials are never stored.** The APIC username/password are supplied with each resync request (from the UI or the scheduler payload) and used only for that pull.

### Page → APIC endpoint → storage

| Page                 | APIC class endpoint(s) queried                                                                                                                         | Resync route                  | Stored in                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Dashboard**        | _none directly_ — aggregates the snapshot/sample tables below                                                                                          | _(reads only)_                | reads `NodeStatusSample`, `Endpoint`, `InterfaceSnapshot`                                                                                                                                               |
| **Endpoints**        | `GET /api/node/class/fvCEp.json?rsp-subtree=children&rsp-subtree-class=fvIp` (endpoints + IPs), `GET /api/node/class/fvAEPg.json` (EPG descriptions) | `POST /api/endpoints/resync`  | `Endpoint` (`mac`, `ip`, `vlan`, `dn`, `node`, `interface`, `epgDescr`, `isActive`)                                                                                                                     |
| **EPGs**             | `GET /api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt,fvRsBd,fvRsDomAtt,fvRsProv,fvRsCons` (EPGs + BD/domain/contract relations + static path bindings) | `POST /api/epgs/resync`       | `EpgSnapshot` (tenant, app profile, BD, pcTag, preferred group, isolation, domains, provided/consumed contracts) + `EpgPathBinding` (pod, node, port, path type, encap, mode) — bulk-replaced each sync |
| **Interface Health** | `GET /api/node/class/l1PhysIf.json?rsp-subtree=full&rsp-subtree-class=ethpmPhysIf,rmonIfIn,rmonIfOut,rmonDot3Stats,rmonEtherStats`                    | `POST /api/interfaces/resync` | `InterfaceSnapshot` (admin/oper state, speed, usage) + `InterfaceSample` (rx/tx bytes, pkts, errors, discards, CRC/align errors, plus per-sync deltas)                                                  |
| **Nodes**            | `GET /api/node/class/fabricNode.json` (inventory), `GET /api/node/class/topSystem.json` (state/uptime/mgmt addr), `GET /api/node/class/eqptPsu.json` (PSUs), `GET /api/node/class/eqptFan.json` (fans) | `POST /api/nodes/resync`      | `NodeSnapshot` (role, model, serial, version, fabric state, uptime) + `HardwareComponent` (PSU/fan oper state + health) + `NodeStatusSample` (nodes total/online, components total/failed)              |
| **History**          | _none_ — read-only view of sync and admin activity                                                                                                     | _(reads only)_                | `AuditLog`                                                                                                                                                                                              |
| **APIC Hosts**       | _none_ — `aaaLogin` test on save                                                                                                                       | _(CRUD)_                      | `ApicHost` (name, host, last-sync timestamps per feature)                                                                                                                                               |

All monitoring queries use the read-only `GET /api/node/class/<class>.json` form of the APIC REST API; the provisioning routes below use `GET`/`POST`/`DELETE` against `/api/node/mo/<dn>.json`.

---

## Architecture

```
Browser → Next.js API routes (proxy) → Cisco APIC
```

All APIC traffic is proxied through Next.js route handlers to avoid CORS. The APIC session token is held in React state — never stored in cookies or localStorage.

| Route                                                  | Purpose                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `POST /api/apic/connect`                               | Authenticate, return session token                                  |
| `POST /api/apic/validate`                              | Validate static port rows against APIC                              |
| `POST /api/apic/deploy`                                | Deploy static port rows                                             |
| `POST /api/apic/validate-rollback`                     | Check which static port rows exist                                  |
| `POST /api/apic/rollback`                              | Remove static port bindings                                         |
| `POST /api/apic/interface-selectors/validate`          | Validate selector rows against APIC                                 |
| `POST /api/apic/interface-selectors/deploy`            | Deploy interface selectors                                          |
| `POST /api/apic/interface-selectors/validate-rollback` | Check which selectors exist                                         |
| `POST /api/apic/interface-selectors/rollback`          | Remove interface selectors                                          |
| `POST /api/apic/bridge-domains/l2/validate`            | Validate L2-only Bridge Domain rows                                 |
| `POST /api/apic/bridge-domains/l2/deploy`              | Deploy L2-only Bridge Domains                                       |
| `POST /api/apic/bridge-domains/l2/validate-rollback`   | Check which L2-only Bridge Domains exist and match rollback intent  |
| `POST /api/apic/bridge-domains/l2/rollback`            | Remove L2-only Bridge Domains                                       |
| `POST /api/apic/bridge-domains/l3/validate`            | Validate L3 Bridge Domain rows                                      |
| `POST /api/apic/bridge-domains/l3/deploy`              | Deploy L3 Bridge Domains, subnets, and L3Out attachment             |
| `POST /api/apic/bridge-domains/l3/validate-rollback`   | Check which L3 Bridge Domains exist and match rollback intent       |
| `POST /api/apic/bridge-domains/l3/rollback`            | Remove L3 Bridge Domains                                            |
| `POST /api/apic/bridge-domains/epgs/validate`          | Validate EPG rows, Bridge Domain binding, and optional contracts    |
| `POST /api/apic/bridge-domains/epgs/deploy`            | Deploy EPGs and attach consumed/provided contracts                  |
| `POST /api/apic/bridge-domains/epgs/rollback/validate` | Check which EPGs or contract relations can be removed               |
| `POST /api/apic/bridge-domains/epgs/rollback`          | Delete EPGs or remove selected consumed/provided contract relations |

### Monitoring / sync routes

These handlers query read-only APIC classes and persist the results (see [Monitoring & Health Checks](#monitoring--health-checks)).

| Route                         | Purpose                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/endpoints/resync`  | Pull endpoints (`fvCEp`/`fvAEPg`) and upsert the `Endpoint` table                                                            |
| `POST /api/epgs/resync`       | Pull `fvAEPg` (with BD/domain/contract relations and static path bindings) and bulk-replace `EpgSnapshot` / `EpgPathBinding` |
| `POST /api/interfaces/resync` | Pull `l1PhysIf` + rmon counters into `InterfaceSnapshot` / `InterfaceSample`                                                 |
| `POST /api/nodes/resync`      | Pull `fabricNode`/`topSystem`/`eqptPsu`/`eqptFan` into `NodeSnapshot` / `HardwareComponent` / `NodeStatusSample`             |
| `POST /api/cron/resync`       | Scheduler entry point — runs all syncs for the supplied hosts (Bearer `SCHEDULER_TOKEN`)                                     |
| `POST /api/endpoints/export`     | Excel (`.xlsx`) export of the stored endpoints, honouring the active filters and grouped by node or VLAN                     |
| `POST /api/epgs/export`          | Excel (`.xlsx`) export of the stored EPGs, grouped by EPG or by port                                                         |
| `POST /api/interfaces/export`    | CSV export of the stored interface samples                                                                                   |

## Running Tests

```bash
bun test
```

Tests cover path construction, CSV validation, and the parallel runner.

## Notes

- The app **does not create tenants, APs/ANPs, VRFs, contracts, L3Outs, or interface profiles** — these must already exist in APIC
- The EPG workflow creates EPGs and binds them to existing Bridge Domains; static port binding still expects the target EPG to exist first
- For static ports, the EPG must have a **physical domain attached** with the target VLANs in its VLAN pool
- APIC session tokens expire after **600 seconds** (10 minutes) by default — reconnect if validation or deploy starts returning 401 errors

## CI
