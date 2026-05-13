# ACI Toolkit

A Next.js web app for bulk provisioning Cisco ACI access policy and fabric bindings via CSV upload. Built for network engineers who need to stand up port policy and static port bindings without touching the APIC GUI.

## Features

- **CSV drag-and-drop** — upload a spreadsheet, get instant validation feedback before anything is sent to APIC
- **Deploy + Rollback** — every feature includes a rollback flow using the same CSV
- **EPG + contract workflows** — create EPGs, bind them to bridge domains, and attach consumed/provided contracts
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

## Bridge Domains

Bulk deploy and rollback bridge domains from CSV. L2-only rows create or delete an `fvBD` with fixed L2 behavior. L3 rows create/delete the bridge domain; APIC removes child subnet and L3Out relations when the parent BD is deleted.

### L2 Only Defaults

| Attribute | Value |
|---|---|
| `unkMacUcastAct` | `flood` |
| `arpFlood` | `true` |
| `unicastRoute` | `no` |
| `mac` | `00:22:BD:F8:19:FF` |

### L2 Only CSV Format

| Column | Description | Example |
|---|---|---|
| `tenant` | Existing tenant name | `TenantA` |
| `bd` | Bridge Domain name | `VLAN1411-BD` |
| `vrf` | Existing VRF name | `TenantA-VRF` |
| `bd_desc` | Optional description | `L2 bridge domain` |

```csv
tenant,bd,vrf,bd_desc
TenantA,VLAN1411-BD,TenantA-VRF,L2 bridge domain
```

### L3 Defaults

| Attribute | Value |
|---|---|
| `unkMacUcastAct` | `proxy` |
| `arpFlood` | `false` |
| `unicastRoute` | `yes` |
| `mac` | `00:22:BD:F8:19:FF` |
| Subnet `scope` | `public` |

### L3 CSV Format

| Column | Description | Example |
|---|---|---|
| `tenant` | Existing tenant name | `TenantA` |
| `bd` | Bridge Domain name | `VLAN1411-BD` |
| `vrf` | Existing VRF name | `TenantA-VRF` |
| `subnet` | Bridge Domain gateway subnet in IPv4 CIDR form | `10.14.11.1/24` |
| `l3out` | Existing L3Out name in the same tenant | `WAN-L3OUT` |
| `bd_desc` | Optional description | `L3 bridge domain` |

```csv
tenant,bd,vrf,subnet,l3out,bd_desc
TenantA,VLAN1411-BD,TenantA-VRF,10.14.11.1/24,WAN-L3OUT,L3 bridge domain
```

---

## EPGs

Bulk deploy and rollback `fvAEPg` objects under existing tenants and application profiles. Each row creates or updates one EPG, binds it to an existing bridge domain, and can attach multiple consumed (`fvRsCons`) and provided (`fvRsProv`) contracts.

### Validation checks (per row)

1. Tenant exists in APIC
2. Application Profile / ANP exists in the tenant
3. Bridge Domain exists in the tenant
4. Optional consumed/provided contracts exist in the tenant
5. Existing EPG is either reusable with the same Bridge Domain, or rejected if it points to a different Bridge Domain
6. Existing contract relations are treated as idempotent; missing relations are queued for deploy

For rollback, rows with contract columns remove only the selected consumed/provided contract relations. Rows without contract columns delete the EPG itself.

### CSV Format

| Column | Description | Example |
|---|---|---|
| `tenant` | Existing tenant name | `TenantA` |
| `anp` | Existing Application Profile / ANP name (`ap` is also accepted) | `APP-A` |
| `epg` | EPG name to create, update, or remove | `WEB-EPG` |
| `bd` | Existing Bridge Domain name to bind | `WEB-BD` |
| `cons_contract` | Optional comma-separated consumed contracts | `WEB-CONTRACT,API-CONTRACT` |
| `prov_contract` | Optional comma-separated provided contracts | `DB-CONTRACT` |
| `epg_desc` | Optional EPG description | `Web frontend EPG` |

### Example

```csv
tenant,anp,epg,bd,cons_contract,prov_contract,epg_desc
TenantA,APP-A,WEB-EPG,WEB-BD,"WEB-CONTRACT,API-CONTRACT",,Web frontend EPG
TenantA,APP-A,DB-EPG,DB-BD,,DB-CONTRACT,Database EPG
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
| `POST /api/apic/bridge-domains/l2/validate` | Validate L2-only Bridge Domain rows |
| `POST /api/apic/bridge-domains/l2/deploy` | Deploy L2-only Bridge Domains |
| `POST /api/apic/bridge-domains/l2/validate-rollback` | Check which L2-only Bridge Domains exist and match rollback intent |
| `POST /api/apic/bridge-domains/l2/rollback` | Remove L2-only Bridge Domains |
| `POST /api/apic/bridge-domains/l3/validate` | Validate L3 Bridge Domain rows |
| `POST /api/apic/bridge-domains/l3/deploy` | Deploy L3 Bridge Domains, subnets, and L3Out attachment |
| `POST /api/apic/bridge-domains/l3/validate-rollback` | Check which L3 Bridge Domains exist and match rollback intent |
| `POST /api/apic/bridge-domains/l3/rollback` | Remove L3 Bridge Domains |
| `POST /api/apic/bridge-domains/epgs/validate` | Validate EPG rows, Bridge Domain binding, and optional contracts |
| `POST /api/apic/bridge-domains/epgs/deploy` | Deploy EPGs and attach consumed/provided contracts |
| `POST /api/apic/bridge-domains/epgs/rollback/validate` | Check which EPGs or contract relations can be removed |
| `POST /api/apic/bridge-domains/epgs/rollback` | Delete EPGs or remove selected consumed/provided contract relations |

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
