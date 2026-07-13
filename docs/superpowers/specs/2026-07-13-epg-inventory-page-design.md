# EPG Inventory Page — Design

**Date:** 2026-07-13
**Status:** Approved

## Purpose

Add an **EPG** page to the Infrastructure section that shows all EPGs with static
port bindings pulled from each APIC, viewable either **by EPG** (with a detail
panel) or **by port** (which EPGs/VLANs sit on each node/port). EPG details are
stored in Postgres so the page works without live APIC credentials.

Source of truth is **configured static port bindings** (`fvRsPathAtt` under each
`fvAEPg`), not operational deployment state.

## Data model

Two new Prisma models in `prisma/schema.prisma`, following the NodeSnapshot
upsert-with-`present`-flag pattern. Add `lastEpgSyncAt DateTime?` to `ApicHost`.

```prisma
model EpgSnapshot {
  id                String    @id @default(cuid())
  apicHostId        String
  apicHost          ApicHost  @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn                String    // uni/tn-<tenant>/ap-<ap>/epg-<name>
  name              String
  tenant            String
  appProfile        String
  description       String    @default("")
  bridgeDomain      String    @default("")   // fvRsBd tnFvBDName
  pcTag             String    @default("")
  preferredGroup    Boolean   @default(false) // prefGrMemb == "include"
  isolation         Boolean   @default(false) // pcEnfPref == "enforced"
  domains           String[]  // fvRsDomAtt tDn, parsed to readable names
  providedContracts String[]  // fvRsProv tnVzBrCPName
  consumedContracts String[]  // fvRsCons tnVzBrCPName
  present           Boolean   @default(true)
  firstSeenAt       DateTime  @default(now())
  lastSeenAt        DateTime  @default(now())
  bindings          EpgPathBinding[]

  @@unique([apicHostId, dn])
  @@index([apicHostId, present])
  @@index([apicHostId, tenant])
}

model EpgPathBinding {
  id          String      @id @default(cuid())
  apicHostId  String
  epgId       String
  epg         EpgSnapshot @relation(fields: [epgId], references: [id], onDelete: Cascade)
  dn          String      // full fvRsPathAtt dn
  pathTDn     String      // raw tDn
  pod         String
  node        String      // "101", or "101-102" for vPC (ascending pair)
  port        String      // "eth1/10", or policy-group name for vPC/PC
  pathType    String      // "port" | "vpc" | "dpc"
  encap       String      // e.g. "vlan-1411"
  mode        String      // "trunk" | "access" | "native" (APIC: regular/untagged/native)
  present     Boolean     @default(true)
  firstSeenAt DateTime    @default(now())
  lastSeenAt  DateTime    @default(now())

  @@unique([apicHostId, dn])
  @@index([apicHostId, present])
  @@index([apicHostId, node])
  @@index([epgId])
}
```

### vPC handling

A vPC binding's tDn is `topology/pod-N/protpaths-<a>-<b>/pathep-[<ipg>]` — one
APIC object spanning both leaves; the bracketed name is the vPC interface policy
group, not a physical port. Stored as **one row** with `node = "<lo>-<hi>"`
(ascending) and `port = <ipg>`, matching the Endpoints page convention
(`src/lib/apic/endpoints.ts` PROTPATH_RE/PATH_RE). The node filter matches
either leaf of a pair (node `101` matches `101` and `101-102`).

## Collector & resync

- **`src/lib/apic/epg-inventory.ts`** (named to avoid the existing
  `src/lib/apic/epgs/` deployment code): one APIC query —
  `GET /api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt,fvRsBd,fvRsDomAtt,fvRsProv,fvRsCons`
  — parses each EPG dn into tenant/appProfile/name, extracts policy fields and
  the child relations, and parses each `fvRsPathAtt` tDn with the same
  protpaths-first regex approach as the endpoints collector.
- **`src/lib/apic/epg-resync.ts`**: acquires the per-host Postgres advisory
  lock, then in a single transaction performs chunked upserts keyed on
  `(apicHostId, dn)` for EPGs then bindings, and flips rows not in the fetched
  set to `present: false` (never deletes). Stamps `ApicHost.lastEpgSyncAt`.
  Returns `{syncedEpgs, syncedBindings}`.

## Sync API & scheduling

- **`POST /api/epgs/resync`** (`src/app/api/epgs/resync/route.ts`): same
  contract as the endpoints resync route — authenticated session required, body
  `{apicHostId, username, password}`, APIC login, resync, audit-log entry.
  Responds `{syncedEpgs, syncedBindings}` on success, `{error}` on failure.
  Reuse the `with-apic-route` helper if it fits.
- **Cron**: add `epgs?: DatasetResult` to `HostResult` in
  `src/lib/apic/cron-resync.ts`, include it in `summarizeResults`, and run the
  EPG resync alongside the other datasets in `/api/cron/resync`.
- **Errors**: a failed EPG fetch fails only the `epgs` dataset (cron result
  `partial`); the transaction ensures tables are never half-updated. The page
  keeps serving last-synced data with its timestamp.

## Page UI

- **Route:** `src/app/(app)/epgs/page.tsx` — replaces the existing mock page
  (unlinked prototype with hardcoded data). Sidebar: add **EPG** to the
  Infrastructure group after Endpoints in `src/components/AppSidebar.tsx`.
- **Structure:** server component per the endpoints pattern — session check,
  APIC host selector, filters read from URL search params, parallel Prisma
  queries (rows, counts, distinct filter values), serialized props into a
  client component `EpgsClient.tsx`.
- **View toggle** via URL param `view=epg|port` (default `epg`):
  - **By EPG:** `EpgSnapshot` rows — Name, Tenant, App Profile, Bridge Domain,
    Ports (binding count), Contracts (count), Present badge. Row click opens a
    right-side detail panel: description, pcTag, preferred group, isolation,
    domains, provided/consumed contracts, and the EPG's port bindings (pod,
    node, port, type, encap, mode).
  - **By Port:** `EpgPathBinding` rows joined with parent EPG — Node, Port,
    Type (port/vPC/PC), Encap VLAN, Mode, EPG (tenant/AP/name), Present badge.
    Natural sort by node then port (as on interface-health).
- **Filters:** search box + dropdown filters for Tenant, App Profile, Node,
  and Present/Absent, using the endpoints page's URL-param cumulative filter
  pattern. The filter bar is shared; filters apply to the active view.
- **Toolbar:** resync button (credentials dialog → `POST /api/epgs/resync`),
  last-synced timestamp, row counts, pagination — per the endpoints page.

## Testing

Colocated unit tests mirroring the existing suites:

- `epg-inventory.test.ts`: tDn parsing (port / vPC / direct PC shapes), fvAEPg
  subtree parsing (BD, domains, contracts, policy flags), dn → tenant/AP/name.
- `epg-resync.test.ts`: write planning — upserts, mark-absent of departed rows,
  chunking — against a mocked Prisma client, like `nodes.test.ts` and
  `endpoint-resync.test.ts`.

## Out of scope

- Operational deployment state (fvIfConn) — static bindings only.
- Historical lifecycle tracking of bindings (endpoints-style
  firstSeen/cleared diffing beyond the `present` flag).
- EPG create/edit/delete from this page — the Workflows section already owns
  EPG deployment; this page is read-only inventory.
