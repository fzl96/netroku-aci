# ACI Toolkit

A Next.js web app for bulk provisioning Cisco ACI access policy and fabric bindings via CSV upload. Built for network engineers who need to stand up port policy and static port bindings without touching the APIC GUI.

## Features

- **CSV drag-and-drop** — upload a spreadsheet, get instant validation feedback before anything is sent to APIC
- **Deploy + Rollback** — every feature includes a rollback flow using the same CSV
- **Parallel execution** — 10 concurrent checks during validate, 5 during deploy
- **Session-aware** — detects expired APIC tokens and prompts reconnect
- **TLS bypass** — works with self-signed APIC certificates out of the box

## Getting Started

```bash
bun install
bun dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Windows users:** Bun on Windows has a known compatibility issue with the TLS bypass library. Use WSL2 or Node.js instead (`npm install && npm run dev`).

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

| Column | Description | Example |
|---|---|---|
| `tenant` | Tenant name | `serverfarm` |
| `ap` | Application Profile name | `DC2-SERVERFARM-AP` |
| `epg` | EPG name | `VLAN1411_EPG` |
| `vlan` | VLAN encap (1–4094) | `1411` |
| `node1` | Primary leaf node ID | `3101` |
| `node2` | Secondary leaf node ID (vpc only, blank otherwise) | `3102` |
| `port_type` | `vpc`, `pc`, or `port` | `vpc` |
| `interface_or_ipg` | IPG name (vpc/pc) or interface (port) | `DC2-SVR-LEAF-3101-3102-VPC-IPG` |
| `mode` | `regular` (tagged), `native`, or `untagged` | `regular` |
| `immediacy` | `immediate` or `lazy` | `immediate` |

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

| Column | Description | Example |
|---|---|---|
| `interface_profile` | Existing `infraAccPortP` name | `leaf101-intf-prof` |
| `selector_name` | Unique per profile — no slashes | `eth1-1` |
| `port` | Cisco notation `card/port` | `1/1` |
| `ipg_name` | Interface Policy Group name | `leaf101-ipg` |
| `ipg_type` | `port`, `pc`, or `vpc` | `port` |
| `description` | Optional — applied to both selector and port block | `Uplink to spine` |

> **Note:** `selector_name` must contain only letters, numbers, hyphens, and underscores. Slashes are not valid in APIC RN values.

### Example

```csv
interface_profile,selector_name,port,ipg_name,ipg_type,description
leaf101-intf-prof,eth1-1,1/1,leaf101-ipg,port,Uplink to spine
leaf101-intf-prof,eth1-2,1/2,leaf101-pc-ipg,pc,vPC member
leaf102-intf-prof,eth1-1,1/1,leaf101-leaf102-vpc-ipg,vpc,
```

---

## Architecture

```
Browser → Next.js API routes (proxy) → Cisco APIC
```

All APIC traffic is proxied through Next.js route handlers to avoid CORS. The APIC session token is held in React state — never stored in cookies or localStorage.

| Route | Purpose |
|---|---|
| `POST /api/apic/connect` | Authenticate, return session token |
| `POST /api/apic/validate` | Validate static port rows against APIC |
| `POST /api/apic/deploy` | Deploy static port rows |
| `POST /api/apic/validate-rollback` | Check which static port rows exist |
| `POST /api/apic/rollback` | Remove static port bindings |
| `POST /api/apic/interface-selectors/validate` | Validate selector rows against APIC |
| `POST /api/apic/interface-selectors/deploy` | Deploy interface selectors |
| `POST /api/apic/interface-selectors/validate-rollback` | Check which selectors exist |
| `POST /api/apic/interface-selectors/rollback` | Remove interface selectors |

## Running Tests

```bash
bun test
```

Tests cover path construction, CSV validation, and the parallel runner.

## Notes

- The app **does not create tenants, APs, EPGs, or interface profiles** — these must already exist in APIC
- For static ports, the EPG must have a **physical domain attached** with the target VLANs in its VLAN pool
- APIC session tokens expire after **600 seconds** (10 minutes) by default — reconnect if validation or deploy starts returning 401 errors
