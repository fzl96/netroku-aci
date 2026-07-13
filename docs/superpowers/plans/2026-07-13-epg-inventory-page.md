# EPG Inventory Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Infrastructure → EPG page showing all EPGs with their static port bindings (from `fvAEPg`/`fvRsPathAtt`), viewable by EPG (with a detail panel) or by port, backed by two new Postgres tables synced manually and via cron.

**Architecture:** Snapshot-upsert pattern copied from the Nodes dataset: an APIC collector parses one `fvAEPg` subtree query into `EpgRow[]`, a resync module upserts `EpgSnapshot` + `EpgPathBinding` rows by `(apicHostId, dn)` inside one transaction guarded by a Postgres advisory lock, flipping departed rows to `present: false`. The page is a Next.js RSC that queries Prisma per URL search params and renders a client table with a By EPG / By Port toggle.

**Tech Stack:** Next.js 16 App Router (RSC + client components), Prisma 6 + PostgreSQL, bun test, Tailwind 4, Radix-based UI components in `src/components/ui/`, Tabler icons.

**Spec:** `docs/superpowers/specs/2026-07-13-epg-inventory-page-design.md`

## Global Constraints

- Tests run with `bun test` (bun:test `describe/it/expect`); test files are colocated next to the module (`foo.test.ts` beside `foo.ts`).
- Import via the `@/` path alias (maps to `src/`).
- Prisma model tables use snake_case `@@map` names (e.g. `@@map("epg_snapshot")`).
- The repo's docs/ dir is gitignored — plan/spec commits used `git add -f`; source code commits need no flag.
- DB commands need the Postgres from `docker-compose.yml` running; migrations run with `bun run prisma:migrate -- --name <name>`.
- vPC bindings are stored as ONE row with `node = "<lo>-<hi>"` (ascending pair) and `port` = the vPC interface policy group name — same convention as `src/lib/apic/endpoints.ts`.
- The existing `src/app/(app)/epgs/page.tsx` is an unlinked mock prototype; it gets fully replaced (no data or consumers depend on it).
- Do not touch `src/lib/apic/epgs/` (EPG *deployment* workflow code) — the new collector lives in separate `epg-inventory.ts` / `epg-resync.ts` files.

---

### Task 1: Prisma schema — EpgSnapshot, EpgPathBinding, ApicHost.lastEpgSyncAt

**Files:**
- Modify: `prisma/schema.prisma` (ApicHost model at ~line 99; append new models after `HardwareComponent`)

**Interfaces:**
- Consumes: existing `ApicHost` model.
- Produces: Prisma client delegates `prisma.epgSnapshot`, `prisma.epgPathBinding`; `ApicHost.lastEpgSyncAt: DateTime?`. Unique keys `@@unique([apicHostId, dn])` on both models (compound-input names `apicHostId_dn`). All later tasks depend on these exact field names.

- [ ] **Step 1: Add `lastEpgSyncAt` and relation to ApicHost**

In `prisma/schema.prisma`, inside `model ApicHost`, add after `lastNodeSyncAt DateTime?`:

```prisma
  lastEpgSyncAt       DateTime?
```

and after `nodeSamples         NodeStatusSample[]`:

```prisma
  epgs                EpgSnapshot[]
```

- [ ] **Step 2: Add the two new models**

Append to `prisma/schema.prisma`:

```prisma
model EpgSnapshot {
  id                String   @id @default(cuid())
  apicHostId        String
  apicHost          ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn                String
  name              String
  tenant            String
  appProfile        String
  description       String   @default("")
  bridgeDomain      String   @default("")
  pcTag             String   @default("")
  preferredGroup    Boolean  @default(false)
  isolation         Boolean  @default(false)
  domains           String[]
  providedContracts String[]
  consumedContracts String[]
  present           Boolean  @default(true)
  firstSeenAt       DateTime @default(now())
  lastSeenAt        DateTime @default(now())
  bindings          EpgPathBinding[]

  @@unique([apicHostId, dn])
  @@index([apicHostId, present])
  @@index([apicHostId, tenant])
  @@map("epg_snapshot")
}

model EpgPathBinding {
  id          String      @id @default(cuid())
  apicHostId  String
  epgId       String
  epg         EpgSnapshot @relation(fields: [epgId], references: [id], onDelete: Cascade)
  dn          String
  pathTDn     String
  pod         String      @default("")
  node        String      @default("")
  port        String      @default("")
  pathType    String      @default("port")
  encap       String      @default("")
  mode        String      @default("trunk")
  present     Boolean     @default(true)
  firstSeenAt DateTime    @default(now())
  lastSeenAt  DateTime    @default(now())

  @@unique([apicHostId, dn])
  @@index([apicHostId, present])
  @@index([apicHostId, node])
  @@index([epgId])
  @@map("epg_path_binding")
}
```

- [ ] **Step 3: Run the migration**

Run: `bun run prisma:migrate -- --name add_epg_inventory`
Expected: `Your database is now in sync with your schema.` and a new folder under `prisma/migrations/` ending in `_add_epg_inventory`. (Prisma also regenerates the client.)

- [ ] **Step 4: Verify the client compiles**

Run: `bunx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add EpgSnapshot and EpgPathBinding models"
```

---

### Task 2: APIC collector — `epg-inventory.ts` (pure parsing + fetch)

**Files:**
- Create: `src/lib/apic/epg-inventory.ts`
- Test: `src/lib/apic/epg-inventory.test.ts`

**Interfaces:**
- Consumes: `apicFetch`, `apicLogin` from `./client` (same signatures used by `src/lib/apic/nodes.ts:187-209`).
- Produces:
  - `interface EpgBindingRow { dn: string; pathTDn: string; pod: string; node: string; port: string; pathType: string; encap: string; mode: string }`
  - `interface EpgRow { dn: string; name: string; tenant: string; appProfile: string; description: string; bridgeDomain: string; pcTag: string; preferredGroup: boolean; isolation: boolean; domains: string[]; providedContracts: string[]; consumedContracts: string[]; bindings: EpgBindingRow[] }`
  - `parseEpgRows(imdata: unknown[]): EpgRow[]`
  - `parsePathTDn(tDn: string): { pod: string; node: string; port: string; pathType: string }`
  - `domainLabelFromTDn(tDn: string): string`
  - `fetchEpgInventoryFromApic(host: string, username: string, plaintextPassword: string): Promise<EpgRow[]>`

Domain-knowledge notes for the implementer:
- An EPG dn looks like `uni/tn-<tenant>/ap-<appProfile>/epg-<name>`.
- `fvRsPathAtt` child attributes carry `tDn`, `encap`, `mode` but not reliably a `dn` in subtree responses — so we build the binding dn deterministically as `` `${epgDn}/rspathAtt-[${tDn}]` `` (that is the actual rn format APIC uses).
- `mode` values from APIC are `regular` (trunk), `untagged` (access), `native` (802.1p); we store the friendly names.
- A binding tDn is one of: `topology/pod-1/paths-101/pathep-[eth1/10]` (physical port), `topology/pod-1/protpaths-101-102/pathep-[<vpc-ipg>]` (vPC), `topology/pod-1/paths-101/pathep-[<pc-ipg>]` (direct port-channel — same shape as physical but the bracketed name is not `ethX/Y`). Anything else (e.g. FEX `extpaths`) becomes `pathType: 'unknown'` with the raw tDn kept in `port` so nothing is silently dropped.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/apic/epg-inventory.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { parseEpgRows, parsePathTDn, domainLabelFromTDn } from './epg-inventory'

describe('parsePathTDn', () => {
  it('parses a physical port path', () => {
    expect(parsePathTDn('topology/pod-1/paths-101/pathep-[eth1/10]')).toEqual({
      pod: '1', node: '101', port: 'eth1/10', pathType: 'port',
    })
  })

  it('parses a vPC protection path as an ascending node pair', () => {
    expect(parsePathTDn('topology/pod-2/protpaths-3114-3113/pathep-[SRV01_VPC_IPG]')).toEqual({
      pod: '2', node: '3113-3114', port: 'SRV01_VPC_IPG', pathType: 'vpc',
    })
  })

  it('classifies a non-eth single path as a direct port-channel', () => {
    expect(parsePathTDn('topology/pod-1/paths-101/pathep-[SRV02_PC_IPG]')).toEqual({
      pod: '1', node: '101', port: 'SRV02_PC_IPG', pathType: 'dpc',
    })
  })

  it('falls back to unknown for unrecognized shapes', () => {
    const tDn = 'topology/pod-1/paths-101/extpaths-102/pathep-[eth1/1]'
    expect(parsePathTDn(tDn)).toEqual({ pod: '1', node: '', port: tDn, pathType: 'unknown' })
  })
})

describe('domainLabelFromTDn', () => {
  it('labels physical, l2, l3 and vmm domains', () => {
    expect(domainLabelFromTDn('uni/phys-PHYS_DOM')).toBe('PHYS_DOM (physical)')
    expect(domainLabelFromTDn('uni/l2dom-L2_DOM')).toBe('L2_DOM (l2)')
    expect(domainLabelFromTDn('uni/l3dom-L3_DOM')).toBe('L3_DOM (l3)')
    expect(domainLabelFromTDn('uni/vmmp-VMware/dom-VC_DOM')).toBe('VC_DOM (vmm VMware)')
  })

  it('falls back to the raw tDn', () => {
    expect(domainLabelFromTDn('uni/somethingelse')).toBe('uni/somethingelse')
  })
})

describe('parseEpgRows', () => {
  const imdata = [
    {
      fvAEPg: {
        attributes: {
          dn: 'uni/tn-serverfarm/ap-DC2-AP/epg-VLAN1411_EPG',
          name: 'VLAN1411_EPG',
          descr: 'Server VLAN 1411',
          pcTag: '16386',
          prefGrMemb: 'include',
          pcEnfPref: 'enforced',
        },
        children: [
          { fvRsBd: { attributes: { tnFvBDName: 'VLAN1411-BD' } } },
          { fvRsDomAtt: { attributes: { tDn: 'uni/phys-PHYS_DOM' } } },
          { fvRsProv: { attributes: { tnVzBrCPName: 'web-contract' } } },
          { fvRsCons: { attributes: { tnVzBrCPName: 'db-contract' } } },
          {
            fvRsPathAtt: {
              attributes: {
                tDn: 'topology/pod-1/paths-101/pathep-[eth1/10]',
                encap: 'vlan-1411',
                mode: 'regular',
              },
            },
          },
          {
            fvRsPathAtt: {
              attributes: {
                tDn: 'topology/pod-1/protpaths-101-102/pathep-[SRV_VPC_IPG]',
                encap: 'vlan-1411',
                mode: 'untagged',
              },
            },
          },
        ],
      },
    },
    // An EPG with no children at all
    {
      fvAEPg: {
        attributes: {
          dn: 'uni/tn-TenantA/ap-App1-AP/epg-DB-EPG',
          name: 'DB-EPG',
          descr: '',
          pcTag: '49153',
          prefGrMemb: 'exclude',
          pcEnfPref: 'unenforced',
        },
      },
    },
  ]

  it('parses identity, policy, relations and bindings', () => {
    const rows = parseEpgRows(imdata)
    expect(rows).toHaveLength(2)

    const [epg, empty] = rows
    expect(epg.tenant).toBe('serverfarm')
    expect(epg.appProfile).toBe('DC2-AP')
    expect(epg.name).toBe('VLAN1411_EPG')
    expect(epg.description).toBe('Server VLAN 1411')
    expect(epg.bridgeDomain).toBe('VLAN1411-BD')
    expect(epg.pcTag).toBe('16386')
    expect(epg.preferredGroup).toBe(true)
    expect(epg.isolation).toBe(true)
    expect(epg.domains).toEqual(['PHYS_DOM (physical)'])
    expect(epg.providedContracts).toEqual(['web-contract'])
    expect(epg.consumedContracts).toEqual(['db-contract'])

    expect(epg.bindings).toHaveLength(2)
    const [phys, vpc] = epg.bindings
    expect(phys.dn).toBe(
      'uni/tn-serverfarm/ap-DC2-AP/epg-VLAN1411_EPG/rspathAtt-[topology/pod-1/paths-101/pathep-[eth1/10]]',
    )
    expect(phys.node).toBe('101')
    expect(phys.port).toBe('eth1/10')
    expect(phys.pathType).toBe('port')
    expect(phys.encap).toBe('vlan-1411')
    expect(phys.mode).toBe('trunk')
    expect(vpc.node).toBe('101-102')
    expect(vpc.port).toBe('SRV_VPC_IPG')
    expect(vpc.pathType).toBe('vpc')
    expect(vpc.mode).toBe('access')

    expect(empty.name).toBe('DB-EPG')
    expect(empty.preferredGroup).toBe(false)
    expect(empty.isolation).toBe(false)
    expect(empty.bindings).toEqual([])
    expect(empty.bridgeDomain).toBe('')
  })

  it('skips non-fvAEPg items and EPGs with unparseable dns', () => {
    const rows = parseEpgRows([
      { somethingElse: { attributes: {} } },
      { fvAEPg: { attributes: { dn: 'uni/tn-weird', name: 'x' } } },
    ])
    expect(rows).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/apic/epg-inventory.test.ts`
Expected: FAIL — cannot resolve module `./epg-inventory`.

- [ ] **Step 3: Implement the collector**

Create `src/lib/apic/epg-inventory.ts`:

```typescript
import { apicFetch, apicLogin } from './client'

export interface EpgBindingRow {
  dn: string
  pathTDn: string
  pod: string
  node: string
  port: string
  pathType: string
  encap: string
  mode: string
}

export interface EpgRow {
  dn: string
  name: string
  tenant: string
  appProfile: string
  description: string
  bridgeDomain: string
  pcTag: string
  preferredGroup: boolean
  isolation: boolean
  domains: string[]
  providedContracts: string[]
  consumedContracts: string[]
  bindings: EpgBindingRow[]
}

interface FvAEPgAttrs {
  dn: string
  name: string
  descr?: string
  pcTag?: string
  prefGrMemb?: string
  pcEnfPref?: string
}

interface FvAEPgChild {
  fvRsBd?: { attributes: { tnFvBDName?: string } }
  fvRsDomAtt?: { attributes: { tDn?: string } }
  fvRsProv?: { attributes: { tnVzBrCPName?: string } }
  fvRsCons?: { attributes: { tnVzBrCPName?: string } }
  fvRsPathAtt?: { attributes: { tDn?: string; encap?: string; mode?: string } }
}

const EPG_DN_RE = /^uni\/tn-([^/]+)\/ap-([^/]+)\/epg-(.+)$/

// Static bindings target one of three path shapes. Check protpaths first
// because a non-anchored "paths-" also appears inside "protpaths-".
const PROT_TDN_RE = /^topology\/pod-(\d+)\/protpaths-(\d+)-(\d+)\/pathep-\[([^\]]+)\]$/
const PATH_TDN_RE = /^topology\/pod-(\d+)\/paths-(\d+)\/pathep-\[([^\]]+)\]$/

// APIC fvRsPathAtt.mode → the terms network engineers actually use.
const MODE_LABEL: Record<string, string> = {
  regular: 'trunk',
  untagged: 'access',
  native: 'native',
}

/**
 * Resolve a static-binding target DN to pod/node/port. vPC protection paths
 * span both leaves and are kept as ONE ascending "<lo>-<hi>" node pair (same
 * convention as the endpoints collector). A single path whose bracketed name
 * is not an ethX/Y port is a direct port-channel policy group. Unrecognized
 * shapes (e.g. FEX extpaths) come back as pathType "unknown" with the raw tDn
 * preserved in `port` so nothing is silently dropped.
 */
export function parsePathTDn(
  tDn: string,
): { pod: string; node: string; port: string; pathType: string } {
  const vpc = PROT_TDN_RE.exec(tDn)
  if (vpc) {
    const [lo, hi] = [Number(vpc[2]), Number(vpc[3])].sort((a, b) => a - b)
    return { pod: vpc[1], node: `${lo}-${hi}`, port: vpc[4], pathType: 'vpc' }
  }
  const single = PATH_TDN_RE.exec(tDn)
  if (single) {
    const port = single[3]
    const pathType = /^eth\d/.test(port) ? 'port' : 'dpc'
    return { pod: single[1], node: single[2], port, pathType }
  }
  const pod = /^topology\/pod-(\d+)\//.exec(tDn)?.[1] ?? ''
  return { pod, node: '', port: tDn, pathType: 'unknown' }
}

/** Turn a fvRsDomAtt target DN into a short human-readable domain label. */
export function domainLabelFromTDn(tDn: string): string {
  const vmm = /^uni\/vmmp-([^/]+)\/dom-(.+)$/.exec(tDn)
  if (vmm) return `${vmm[2]} (vmm ${vmm[1]})`
  const phys = /^uni\/phys-(.+)$/.exec(tDn)
  if (phys) return `${phys[1]} (physical)`
  const l2 = /^uni\/l2dom-(.+)$/.exec(tDn)
  if (l2) return `${l2[1]} (l2)`
  const l3 = /^uni\/l3dom-(.+)$/.exec(tDn)
  if (l3) return `${l3[1]} (l3)`
  return tDn
}

/**
 * Transform raw `fvAEPg` imdata (with rsp-subtree children) into EpgRow[].
 * Pure — no network — so all parsing is unit-testable. Subtree children don't
 * reliably carry a dn, so each binding's dn is rebuilt deterministically from
 * its rn format: `<epgDn>/rspathAtt-[<tDn>]`.
 */
export function parseEpgRows(imdata: unknown[]): EpgRow[] {
  const rows: EpgRow[] = []

  for (const item of imdata) {
    const mo = (item as { fvAEPg?: { attributes: FvAEPgAttrs; children?: FvAEPgChild[] } }).fvAEPg
    if (!mo) continue

    const a = mo.attributes
    const dnMatch = EPG_DN_RE.exec(a.dn ?? '')
    if (!dnMatch) continue

    const row: EpgRow = {
      dn: a.dn,
      name: a.name ?? dnMatch[3],
      tenant: dnMatch[1],
      appProfile: dnMatch[2],
      description: a.descr ?? '',
      bridgeDomain: '',
      pcTag: a.pcTag ?? '',
      preferredGroup: a.prefGrMemb === 'include',
      isolation: a.pcEnfPref === 'enforced',
      domains: [],
      providedContracts: [],
      consumedContracts: [],
      bindings: [],
    }

    for (const child of mo.children ?? []) {
      const bd = child.fvRsBd?.attributes.tnFvBDName
      if (bd) row.bridgeDomain = bd

      const domTDn = child.fvRsDomAtt?.attributes.tDn
      if (domTDn) row.domains.push(domainLabelFromTDn(domTDn))

      const prov = child.fvRsProv?.attributes.tnVzBrCPName
      if (prov) row.providedContracts.push(prov)

      const cons = child.fvRsCons?.attributes.tnVzBrCPName
      if (cons) row.consumedContracts.push(cons)

      const path = child.fvRsPathAtt?.attributes
      if (path?.tDn) {
        const { pod, node, port, pathType } = parsePathTDn(path.tDn)
        row.bindings.push({
          dn: `${a.dn}/rspathAtt-[${path.tDn}]`,
          pathTDn: path.tDn,
          pod,
          node,
          port,
          pathType,
          encap: path.encap ?? '',
          mode: MODE_LABEL[path.mode ?? ''] ?? (path.mode ?? ''),
        })
      }
    }

    rows.push(row)
  }

  return rows
}

async function apicGet(host: string, token: string, path: string): Promise<unknown[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = await res.json() as { imdata?: unknown[] }
  return data.imdata ?? []
}

export async function fetchEpgInventoryFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<EpgRow[]> {
  const token = await apicLogin(host, username, plaintextPassword)
  const imdata = await apicGet(
    host,
    token,
    '/api/node/class/fvAEPg.json?rsp-subtree=children&rsp-subtree-class=fvRsPathAtt,fvRsBd,fvRsDomAtt,fvRsProv,fvRsCons',
  )
  return parseEpgRows(imdata)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/apic/epg-inventory.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/epg-inventory.ts src/lib/apic/epg-inventory.test.ts
git commit -m "feat(apic): add EPG inventory collector parsing fvAEPg subtree"
```

---

### Task 3: Resync writes — `epg-resync.ts`

**Files:**
- Create: `src/lib/apic/epg-resync.ts`
- Test: `src/lib/apic/epg-resync.test.ts`

**Interfaces:**
- Consumes: `fetchEpgInventoryFromApic`, `EpgRow`, `EpgBindingRow` from `./epg-inventory` (Task 2); `prisma` from `@/lib/prisma`.
- Produces:
  - `class EpgResyncInProgressError extends Error` (has `name = 'EpgResyncInProgressError'`)
  - `interface ResyncEpgsArgs { apicHostId: string; host: string; username: string; password: string }`
  - `interface ResyncEpgsResult { syncedEpgs: number; syncedBindings: number }`
  - `resyncEpgs(args: ResyncEpgsArgs): Promise<ResyncEpgsResult>` — used by Tasks 4 & 5.
  - `executeEpgResyncWrites(db: EpgWriteClient, apicHostId: string, epgs: EpgRow[], now: Date): Promise<ResyncEpgsResult>` — exported for tests.
  - `interface EpgWriteClient { $transaction<T>(fn: (tx: EpgMutationClient) => Promise<T>, options?: { timeout?: number }): Promise<T> }` where `EpgMutationClient` exposes `epgSnapshot: Pick<..., 'upsert' | 'updateMany'>`, `epgPathBinding: Pick<..., 'upsert' | 'updateMany'>`, `apicHost: Pick<..., 'update'>`, and `$queryRaw`.

Design notes: mirror `executeNodeResyncWrites` (`src/lib/apic/nodes.ts:281-357`) for the upsert/mark-absent shape and the endpoints advisory lock (`src/lib/apic/endpoints.ts:273-281`) for concurrency. EPG upserts must run before binding upserts because bindings need the parent row id (`idByDn` map built from upsert return values). Advisory lock namespace is a fresh constant so EPG resyncs don't contend with endpoint resyncs.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/apic/epg-resync.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import {
  executeEpgResyncWrites,
  EpgResyncInProgressError,
  type EpgWriteClient,
} from './epg-resync'
import type { EpgRow } from './epg-inventory'

function makeEpg(overrides: Partial<EpgRow> = {}): EpgRow {
  return {
    dn: 'uni/tn-t1/ap-ap1/epg-e1',
    name: 'e1',
    tenant: 't1',
    appProfile: 'ap1',
    description: '',
    bridgeDomain: 'bd1',
    pcTag: '16386',
    preferredGroup: false,
    isolation: false,
    domains: ['PHYS (physical)'],
    providedContracts: ['c-prov'],
    consumedContracts: [],
    bindings: [
      {
        dn: 'uni/tn-t1/ap-ap1/epg-e1/rspathAtt-[topology/pod-1/paths-101/pathep-[eth1/10]]',
        pathTDn: 'topology/pod-1/paths-101/pathep-[eth1/10]',
        pod: '1',
        node: '101',
        port: 'eth1/10',
        pathType: 'port',
        encap: 'vlan-10',
        mode: 'trunk',
      },
    ],
    ...overrides,
  }
}

interface Calls {
  epgUpserts: unknown[]
  epgUpdateManys: unknown[]
  bindingUpserts: unknown[]
  bindingUpdateManys: unknown[]
  hostUpdates: unknown[]
}

function mockClient(lockAcquired = true): { client: EpgWriteClient; calls: Calls } {
  const calls: Calls = {
    epgUpserts: [], epgUpdateManys: [], bindingUpserts: [], bindingUpdateManys: [], hostUpdates: [],
  }
  const tx = {
    epgSnapshot: {
      upsert: async (args: { where: { apicHostId_dn: { dn: string } } }) => {
        calls.epgUpserts.push(args)
        return { id: `epg-${args.where.apicHostId_dn.dn}` }
      },
      updateMany: async (args: unknown) => { calls.epgUpdateManys.push(args); return { count: 0 } },
    },
    epgPathBinding: {
      upsert: async (args: unknown) => { calls.bindingUpserts.push(args); return { id: 'b1' } },
      updateMany: async (args: unknown) => { calls.bindingUpdateManys.push(args); return { count: 0 } },
    },
    apicHost: {
      update: async (args: unknown) => { calls.hostUpdates.push(args); return {} },
    },
    $queryRaw: async () => [{ acquired: lockAcquired }],
  }
  const client = {
    $transaction: async <T,>(fn: (t: typeof tx) => Promise<T>) => fn(tx),
  } as unknown as EpgWriteClient
  return { client, calls }
}

describe('executeEpgResyncWrites', () => {
  const now = new Date('2026-07-13T00:00:00Z')

  it('upserts EPGs then bindings with the parent id, and marks absentees', async () => {
    const { client, calls } = mockClient()
    const epg = makeEpg()

    const result = await executeEpgResyncWrites(client, 'host-1', [epg], now)

    expect(result).toEqual({ syncedEpgs: 1, syncedBindings: 1 })
    expect(calls.epgUpserts).toHaveLength(1)
    const epgUpsert = calls.epgUpserts[0] as {
      where: { apicHostId_dn: { apicHostId: string; dn: string } }
      create: Record<string, unknown>
      update: Record<string, unknown>
    }
    expect(epgUpsert.where.apicHostId_dn).toEqual({ apicHostId: 'host-1', dn: epg.dn })
    expect(epgUpsert.create.tenant).toBe('t1')
    expect(epgUpsert.update.present).toBe(true)
    expect(epgUpsert.update.lastSeenAt).toEqual(now)

    const bindingUpsert = calls.bindingUpserts[0] as {
      where: { apicHostId_dn: { dn: string } }
      create: Record<string, unknown>
    }
    expect(bindingUpsert.create.epgId).toBe(`epg-${epg.dn}`)
    expect(bindingUpsert.create.node).toBe('101')

    // Absent EPGs and bindings flipped to present: false, scoped to still-present rows.
    const epgAbsent = calls.epgUpdateManys[0] as {
      where: { apicHostId: string; present: boolean; dn: { notIn: string[] } }
      data: { present: boolean }
    }
    expect(epgAbsent.where.dn.notIn).toEqual([epg.dn])
    expect(epgAbsent.data.present).toBe(false)
    const bindingAbsent = calls.bindingUpdateManys[0] as {
      where: { dn: { notIn: string[] } }
      data: { present: boolean }
    }
    expect(bindingAbsent.where.dn.notIn).toEqual([epg.bindings[0].dn])
    expect(bindingAbsent.data.present).toBe(false)

    // lastEpgSyncAt stamped inside the same transaction.
    expect(calls.hostUpdates).toHaveLength(1)
    const hostUpdate = calls.hostUpdates[0] as { data: { lastEpgSyncAt: Date } }
    expect(hostUpdate.data.lastEpgSyncAt).toEqual(now)
  })

  it('throws EpgResyncInProgressError when the advisory lock is taken', async () => {
    const { client } = mockClient(false)
    await expect(executeEpgResyncWrites(client, 'host-1', [makeEpg()], now))
      .rejects.toBeInstanceOf(EpgResyncInProgressError)
  })

  it('counts bindings across all EPGs', async () => {
    const { client } = mockClient()
    const e1 = makeEpg()
    const e2 = makeEpg({
      dn: 'uni/tn-t1/ap-ap1/epg-e2',
      name: 'e2',
      bindings: [],
    })
    const result = await executeEpgResyncWrites(client, 'host-1', [e1, e2], now)
    expect(result).toEqual({ syncedEpgs: 2, syncedBindings: 1 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/apic/epg-resync.test.ts`
Expected: FAIL — cannot resolve module `./epg-resync`.

- [ ] **Step 3: Implement the resync module**

Create `src/lib/apic/epg-resync.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { fetchEpgInventoryFromApic, type EpgRow } from './epg-inventory'

const EPG_CHUNK_SIZE = 100
const EPG_TRANSACTION_TIMEOUT_MS = 30_000
// Distinct from the endpoints lock namespace (20_260_619) so EPG and endpoint
// resyncs for the same host don't contend with each other.
const EPG_ADVISORY_LOCK_NAMESPACE = 20_260_713

/** Thrown when an EPG resync is requested for a host that already has one running. */
export class EpgResyncInProgressError extends Error {
  constructor(apicHostId: string) {
    super(`An EPG resync is already in progress for host ${apicHostId}`)
    this.name = 'EpgResyncInProgressError'
  }
}

type EpgSnapshotDelegate = Pick<typeof prisma.epgSnapshot, 'upsert' | 'updateMany'>
type EpgPathBindingDelegate = Pick<typeof prisma.epgPathBinding, 'upsert' | 'updateMany'>
type ApicHostDelegate = Pick<typeof prisma.apicHost, 'update'>

interface EpgMutationClient {
  epgSnapshot: EpgSnapshotDelegate
  epgPathBinding: EpgPathBindingDelegate
  apicHost: ApicHostDelegate
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>
}

export interface EpgWriteClient {
  $transaction<T>(
    fn: (tx: EpgMutationClient) => Promise<T>,
    options?: { timeout?: number },
  ): Promise<T>
}

export interface ResyncEpgsArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncEpgsResult {
  syncedEpgs: number
  syncedBindings: number
}

/**
 * Fetch EPG inventory (with static port bindings) from APIC and persist it for
 * one host. Upserts EpgSnapshot then EpgPathBinding by (apicHostId, dn) and
 * flips departed rows to present: false — rows are never deleted. Serialized
 * per host via a Postgres advisory transaction lock.
 */
export async function resyncEpgs(args: ResyncEpgsArgs): Promise<ResyncEpgsResult> {
  const { apicHostId, host, username, password } = args

  const fetched = await fetchEpgInventoryFromApic(host, username, password)

  // Deduplicate by dn (defensive — the class query should already be unique).
  const byDn = new Map<string, EpgRow>()
  for (const epg of fetched) byDn.set(epg.dn, epg)
  const uniqueEpgs = Array.from(byDn.values())

  return executeEpgResyncWrites(prisma, apicHostId, uniqueEpgs, new Date())
}

async function tryAcquireEpgResyncAdvisoryLock(
  tx: Pick<EpgMutationClient, '$queryRaw'>,
  apicHostId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ acquired: boolean }>>`
    SELECT pg_try_advisory_xact_lock(${EPG_ADVISORY_LOCK_NAMESPACE}::integer, hashtext(${apicHostId})) AS acquired
  `
  return rows[0]?.acquired === true
}

export async function executeEpgResyncWrites(
  db: EpgWriteClient,
  apicHostId: string,
  epgs: EpgRow[],
  now: Date,
): Promise<ResyncEpgsResult> {
  return db.$transaction(async tx => {
    const acquired = await tryAcquireEpgResyncAdvisoryLock(tx, apicHostId)
    if (!acquired) throw new EpgResyncInProgressError(apicHostId)

    // Upsert EPGs first — bindings need the parent row ids.
    const idByDn = new Map<string, string>()
    for (let i = 0; i < epgs.length; i += EPG_CHUNK_SIZE) {
      const chunk = epgs.slice(i, i + EPG_CHUNK_SIZE)
      const upserted = await Promise.all(
        chunk.map(e =>
          tx.epgSnapshot.upsert({
            where: { apicHostId_dn: { apicHostId, dn: e.dn } },
            update: {
              name: e.name, tenant: e.tenant, appProfile: e.appProfile,
              description: e.description, bridgeDomain: e.bridgeDomain,
              pcTag: e.pcTag, preferredGroup: e.preferredGroup,
              isolation: e.isolation, domains: e.domains,
              providedContracts: e.providedContracts,
              consumedContracts: e.consumedContracts,
              present: true, lastSeenAt: now,
            },
            create: {
              apicHostId, dn: e.dn, name: e.name, tenant: e.tenant,
              appProfile: e.appProfile, description: e.description,
              bridgeDomain: e.bridgeDomain, pcTag: e.pcTag,
              preferredGroup: e.preferredGroup, isolation: e.isolation,
              domains: e.domains, providedContracts: e.providedContracts,
              consumedContracts: e.consumedContracts,
              present: true, firstSeenAt: now, lastSeenAt: now,
            },
          }),
        ),
      )
      chunk.forEach((e, j) => idByDn.set(e.dn, upserted[j].id))
    }
    await tx.epgSnapshot.updateMany({
      where: { apicHostId, present: true, dn: { notIn: epgs.map(e => e.dn) } },
      data: { present: false },
    })

    // Bindings, deduped by dn across all EPGs.
    const bindingByDn = new Map<string, { epgDn: string; binding: EpgRow['bindings'][number] }>()
    for (const e of epgs) {
      for (const b of e.bindings) bindingByDn.set(b.dn, { epgDn: e.dn, binding: b })
    }
    const uniqueBindings = Array.from(bindingByDn.values())

    for (let i = 0; i < uniqueBindings.length; i += EPG_CHUNK_SIZE) {
      const chunk = uniqueBindings.slice(i, i + EPG_CHUNK_SIZE)
      await Promise.all(
        chunk.map(({ epgDn, binding: b }) => {
          const epgId = idByDn.get(epgDn)!
          return tx.epgPathBinding.upsert({
            where: { apicHostId_dn: { apicHostId, dn: b.dn } },
            update: {
              epgId, pathTDn: b.pathTDn, pod: b.pod, node: b.node,
              port: b.port, pathType: b.pathType, encap: b.encap,
              mode: b.mode, present: true, lastSeenAt: now,
            },
            create: {
              apicHostId, epgId, dn: b.dn, pathTDn: b.pathTDn, pod: b.pod,
              node: b.node, port: b.port, pathType: b.pathType,
              encap: b.encap, mode: b.mode,
              present: true, firstSeenAt: now, lastSeenAt: now,
            },
          })
        }),
      )
    }
    await tx.epgPathBinding.updateMany({
      where: { apicHostId, present: true, dn: { notIn: uniqueBindings.map(u => u.binding.dn) } },
      data: { present: false },
    })

    await tx.apicHost.update({
      where: { id: apicHostId },
      data: { lastEpgSyncAt: now },
    })

    return { syncedEpgs: epgs.length, syncedBindings: uniqueBindings.length }
  }, { timeout: EPG_TRANSACTION_TIMEOUT_MS })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/apic/epg-resync.test.ts`
Expected: PASS, all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/epg-resync.ts src/lib/apic/epg-resync.test.ts
git commit -m "feat(apic): add EPG resync with snapshot upserts and advisory lock"
```

---

### Task 4: Resync API route — `POST /api/epgs/resync`

**Files:**
- Create: `src/app/api/epgs/resync/route.ts`

**Interfaces:**
- Consumes: `resyncEpgs`, `EpgResyncInProgressError`, `ResyncEpgsResult` (Task 3); `auth`, `prisma`, `recordAudit` exactly as used by `src/app/api/endpoints/resync/route.ts`.
- Produces: `POST /api/epgs/resync` accepting `{apicHostId, username, password}`; responds 200 `{syncedEpgs, syncedBindings}`, or `{error}` with 400/401/404/409/502. The client (Task 8) calls this.

No unit test — this route is thin glue over tested modules, matching the untested endpoints resync route. Verified by typecheck here and manually in Task 10.

- [ ] **Step 1: Implement the route**

Create `src/app/api/epgs/resync/route.ts`:

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import {
  resyncEpgs,
  EpgResyncInProgressError,
  type ResyncEpgsResult,
} from '@/lib/apic/epg-resync'

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let apicHostId: string
  let username: string
  let password: string
  try {
    ;({ apicHostId, username, password } = await request.json())
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!apicHostId) return Response.json({ error: 'apicHostId is required' }, { status: 400 })
  if (!username?.trim() || !password) {
    return Response.json({ error: 'username and password are required' }, { status: 400 })
  }

  const apicHost = await prisma.apicHost.findFirst({ where: { id: apicHostId } })
  if (!apicHost) return Response.json({ error: 'Host not found' }, { status: 404 })

  let result: ResyncEpgsResult
  try {
    result = await resyncEpgs({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    if (err instanceof EpgResyncInProgressError) {
      return Response.json({ error: err.message }, { status: 409 })
    }
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch EPGs from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.epgs',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.syncedEpgs} EPGs (${result.syncedBindings} bindings)`,
  })

  return Response.json(result)
}
```

- [ ] **Step 2: Typecheck**

Run: `bunx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/epgs/resync/route.ts
git commit -m "feat(api): add EPG resync route"
```

---

### Task 5: Cron integration — `epgs` dataset

**Files:**
- Modify: `src/lib/apic/cron-resync.ts` (HostResult at line 5-15; summarizeResults at line 38-55)
- Modify: `src/app/api/cron/resync/route.ts` (add a dataset block after Nodes, before `results.push(result)` at line 191)
- Test: `src/lib/apic/cron-resync.test.ts` (append a case)

**Interfaces:**
- Consumes: `resyncEpgs` (Task 3); existing `DatasetResult`, `HostResult`, `summarizeResults`.
- Produces: `HostResult.epgs?: DatasetResult`; the cron POST body/behavior is unchanged, it just runs one more dataset per host.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/apic/cron-resync.test.ts` (keep existing imports; `summarizeResults` is already imported there):

```typescript
describe('summarizeResults epgs dataset', () => {
  it('counts a failed epgs dataset toward partial status', () => {
    const status = summarizeResults([
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        epgs: { error: 'boom' },
      },
    ])
    expect(status).toBe('partial')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: FAIL — either a type error on `epgs` or status `'success'` instead of `'partial'` (the epgs dataset is not yet counted).

- [ ] **Step 3: Extend HostResult and summarizeResults**

In `src/lib/apic/cron-resync.ts`, add to `HostResult` after `nodes?: DatasetResult`:

```typescript
  epgs?: DatasetResult
```

and in `summarizeResults`, change the dataset array line to:

```typescript
    for (const d of [r.endpoints, r.interfaces, r.faults, r.healthScores, r.nodes, r.epgs]) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: PASS (all pre-existing cases plus the new one).

- [ ] **Step 5: Run the epgs dataset in the cron route**

In `src/app/api/cron/resync/route.ts`, add the import:

```typescript
import { resyncEpgs } from '@/lib/apic/epg-resync'
```

and insert this block after the "Nodes & hardware" block (after `result.nodes = nodes`' audit call, immediately before `results.push(result)`):

```typescript
    // EPGs & static port bindings
    let epgs: DatasetResult
    try {
      const r = await resyncEpgs({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
      epgs = { synced: r.syncedEpgs, total: r.syncedEpgs + r.syncedBindings }
    } catch (err) {
      epgs = { error: errorMessage(err, 'Failed to resync EPGs') }
    }
    result.epgs = epgs
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.epgs',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in epgs ? 'failure' : 'success',
      detail: 'error' in epgs
        ? epgs.error
        : `synced ${epgs.synced} EPGs (total ${epgs.total})`,
    })
```

- [ ] **Step 6: Typecheck and full test run**

Run: `bunx tsc --noEmit && bun test`
Expected: exit 0, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/apic/cron-resync.ts src/lib/apic/cron-resync.test.ts src/app/api/cron/resync/route.ts
git commit -m "feat(cron): include EPG inventory in scheduled resync"
```

---

### Task 6: Query helpers and natural sort

**Files:**
- Create: `src/lib/epgs/query.ts`
- Test: `src/lib/epgs/query.test.ts`
- Create: `src/app/(app)/epgs/sort.ts`
- Test: `src/app/(app)/epgs/sort.test.ts`

**Interfaces:**
- Consumes: `Prisma` types from `@prisma/client` (Task 1).
- Produces (Task 7/8 depend on these exact names):
  - `type EpgPresenceFilter = 'present' | 'absent'`
  - `interface EpgFilters { query?: string; tenant?: string[]; ap?: string[]; presence?: EpgPresenceFilter[] }`
  - `interface BindingFilters extends EpgFilters { node?: string[] }`
  - `buildEpgWhere(apicHostId: string, filters: EpgFilters): Prisma.EpgSnapshotWhereInput`
  - `buildBindingWhere(apicHostId: string, filters: BindingFilters): Prisma.EpgPathBindingWhereInput`
  - `countActiveEpgFilterGroups(filters: BindingFilters): number`
  - `expandNodeOptions(values: string[]): string[]` — splits stored `"101-102"` pairs into individual leaf options, dedupes, natural-sorts.
  - `sortBindingRows<T extends { node: string; port: string }>(rows: T[]): T[]` (in `sort.ts`) — natural sort by node then port.
  - `type EpgWithBindings = Prisma.EpgSnapshotGetPayload<{ include: { bindings: true } }>`
  - `type BindingWithEpg = Prisma.EpgPathBindingGetPayload<{ include: { epg: { select: { name: true; tenant: true; appProfile: true; dn: true; present: true } } } }>`

Key behavior: a node filter value `"101"` must match rows where `node` is exactly `"101"` **or** a vPC pair containing 101 (`"101-102"` / `"99-101"`). Implemented as an OR of `equals` / `startsWith: "101-"` / `endsWith: "-101"` per selected value.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/epgs/query.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import {
  buildEpgWhere,
  buildBindingWhere,
  countActiveEpgFilterGroups,
  expandNodeOptions,
} from './query'

describe('buildEpgWhere', () => {
  it('scopes to host and maps filters', () => {
    const where = buildEpgWhere('h1', {
      tenant: ['t1'],
      ap: ['ap1'],
      presence: ['present'],
      query: 'web',
    })
    expect(where.apicHostId).toBe('h1')
    expect(where.tenant).toEqual({ in: ['t1'] })
    expect(where.appProfile).toEqual({ in: ['ap1'] })
    expect(where.present).toBe(true)
    expect(where.OR).toBeDefined()
  })

  it('omits present when both or no presence values selected', () => {
    expect(buildEpgWhere('h1', { presence: [] }).present).toBeUndefined()
    expect(buildEpgWhere('h1', { presence: ['present', 'absent'] }).present).toBeUndefined()
  })
})

describe('buildBindingWhere', () => {
  it('matches a leaf inside vPC pairs', () => {
    const where = buildBindingWhere('h1', { node: ['101'] })
    expect(where.AND).toEqual([
      {
        OR: [
          { node: '101' },
          { node: { startsWith: '101-' } },
          { node: { endsWith: '-101' } },
        ],
      },
    ])
  })

  it('applies tenant/ap through the epg relation', () => {
    const where = buildBindingWhere('h1', { tenant: ['t1'], ap: ['ap1'] })
    expect(where.epg).toEqual({ tenant: { in: ['t1'] }, appProfile: { in: ['ap1'] } })
  })
})

describe('countActiveEpgFilterGroups', () => {
  it('counts non-empty filter groups', () => {
    expect(countActiveEpgFilterGroups({})).toBe(0)
    expect(countActiveEpgFilterGroups({ tenant: ['t'], node: ['101'], presence: [] })).toBe(2)
  })
})

describe('expandNodeOptions', () => {
  it('splits pairs, dedupes and natural-sorts', () => {
    expect(expandNodeOptions(['101-102', '101', '99', '3113-3114'])).toEqual(
      ['99', '101', '102', '3113', '3114'],
    )
  })
})
```

Create `src/app/(app)/epgs/sort.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { sortBindingRows } from './sort'

describe('sortBindingRows', () => {
  it('natural sorts by node then port', () => {
    const rows = [
      { node: '101', port: 'eth1/10' },
      { node: '101', port: 'eth1/2' },
      { node: '99', port: 'eth1/1' },
      { node: '101-102', port: 'VPC_IPG' },
    ]
    expect(sortBindingRows(rows).map(r => `${r.node} ${r.port}`)).toEqual([
      '99 eth1/1',
      '101 eth1/2',
      '101 eth1/10',
      '101-102 VPC_IPG',
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/epgs/query.test.ts src/app/\(app\)/epgs/sort.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/epgs/query.ts`:

```typescript
import type { Prisma } from '@prisma/client'

export type EpgPresenceFilter = 'present' | 'absent'

export interface EpgFilters {
  query?: string
  tenant?: string[]
  ap?: string[]
  presence?: EpgPresenceFilter[]
}

export interface BindingFilters extends EpgFilters {
  node?: string[]
}

export type EpgWithBindings = Prisma.EpgSnapshotGetPayload<{
  include: { bindings: true }
}>

export type BindingWithEpg = Prisma.EpgPathBindingGetPayload<{
  include: {
    epg: { select: { name: true; tenant: true; appProfile: true; dn: true; present: true } }
  }
}>

export function countActiveEpgFilterGroups(filters: BindingFilters): number {
  return [filters.tenant, filters.ap, filters.node, filters.presence]
    .filter(values => values && values.length > 0)
    .length
}

function presentValue(presence?: EpgPresenceFilter[]): boolean | undefined {
  if (presence?.length !== 1) return undefined
  return presence[0] === 'present'
}

export function buildEpgWhere(
  apicHostId: string,
  filters: EpgFilters,
): Prisma.EpgSnapshotWhereInput {
  const query = filters.query?.trim()
  const present = presentValue(filters.presence)

  return {
    apicHostId,
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
    ...(present !== undefined ? { present } : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { tenant: { contains: query, mode: 'insensitive' } },
            { appProfile: { contains: query, mode: 'insensitive' } },
            { bridgeDomain: { contains: query, mode: 'insensitive' } },
            { description: { contains: query, mode: 'insensitive' } },
            { dn: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  }
}

/** A selected leaf matches an exact node or either member of a vPC pair. */
function nodeCondition(value: string): Prisma.EpgPathBindingWhereInput {
  return {
    OR: [
      { node: value },
      { node: { startsWith: `${value}-` } },
      { node: { endsWith: `-${value}` } },
    ],
  }
}

export function buildBindingWhere(
  apicHostId: string,
  filters: BindingFilters,
): Prisma.EpgPathBindingWhereInput {
  const query = filters.query?.trim()
  const present = presentValue(filters.presence)

  const epgWhere: Prisma.EpgSnapshotWhereInput = {
    ...(filters.tenant?.length ? { tenant: { in: filters.tenant } } : {}),
    ...(filters.ap?.length ? { appProfile: { in: filters.ap } } : {}),
  }

  return {
    apicHostId,
    ...(present !== undefined ? { present } : {}),
    ...(Object.keys(epgWhere).length > 0 ? { epg: epgWhere } : {}),
    ...(filters.node?.length
      ? { AND: [{ OR: filters.node.flatMap(v => nodeCondition(v).OR!) }] }
      : {}),
    ...(query
      ? {
          OR: [
            { node: { contains: query, mode: 'insensitive' } },
            { port: { contains: query, mode: 'insensitive' } },
            { encap: { contains: query, mode: 'insensitive' } },
            { epg: { name: { contains: query, mode: 'insensitive' } } },
            { epg: { tenant: { contains: query, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }
}

const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Distinct stored node values ("101", "101-102") → individual leaf options. */
export function expandNodeOptions(values: string[]): string[] {
  const leaves = new Set<string>()
  for (const value of values) {
    for (const leaf of value.split('-')) {
      if (leaf) leaves.add(leaf)
    }
  }
  return Array.from(leaves).sort((a, b) => NATURAL_COLLATOR.compare(a, b))
}
```

Note: `nodeCondition(v).OR!` flattens each value's three conditions into one OR list; wrapping in `AND` keeps it from colliding with the search-query `OR`.

Create `src/app/(app)/epgs/sort.ts`:

```typescript
const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

/** Natural sort bindings by node then port (eth1/2 before eth1/10). */
export function sortBindingRows<T extends { node: string; port: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      NATURAL_COLLATOR.compare(a.node, b.node) || NATURAL_COLLATOR.compare(a.port, b.port),
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/epgs/query.test.ts src/app/\(app\)/epgs/sort.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/epgs src/app/\(app\)/epgs/sort.ts src/app/\(app\)/epgs/sort.test.ts
git commit -m "feat(epgs): add query helpers and natural binding sort"
```

---

### Task 7: Extract shared FilterSubmenu component

**Files:**
- Create: `src/components/FilterSubmenu.tsx`
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx` (delete the inline `FilterSubmenu` at lines 80-163 and its now-unused imports; import the shared one)

**Interfaces:**
- Consumes: `DropdownMenu*` primitives, `Input` from `@/components/ui/`.
- Produces: `FilterSubmenu({ label, value, options, onChange, disabled?, searchable? })` — exact same props as the current inline component. Task 8's client uses it.

This is a pure code move (DRY): the EPG page needs the identical submenu and duplicating 80 lines of dropdown code would be worse than a one-time extraction.

- [ ] **Step 1: Create the shared component**

Create `src/components/FilterSubmenu.tsx` with exactly the current implementation plus the client directive and imports:

```typescript
'use client'

import { useState } from 'react'
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

export function FilterSubmenu({
  label,
  value,
  options,
  onChange,
  disabled,
  searchable = false,
}: {
  label: string
  value: string[]
  options: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  searchable?: boolean
}) {
  const [searchValue, setSearchValue] = useState('')

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const visibleOptions = searchable && searchValue.trim()
    ? options.filter(option => option.toLowerCase().includes(searchValue.trim().toLowerCase()))
    : options

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <span>{label}</span>
        {value.length > 0 && (
          <span className="ml-auto mr-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
            {value.length}
          </span>
        )}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-48">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {searchable && (
          <div className="px-1 pb-1">
            <Input
              value={searchValue}
              onChange={event => setSearchValue(event.target.value)}
              onKeyDown={event => event.stopPropagation()}
              placeholder={`Search ${label.toLowerCase()}…`}
              disabled={disabled || options.length === 0}
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className={searchable ? 'max-h-56 overflow-y-auto pr-1' : undefined}>
          {options.length === 0 ? (
            <DropdownMenuItem disabled>No values available</DropdownMenuItem>
          ) : visibleOptions.length === 0 ? (
            <DropdownMenuItem disabled>No matching values</DropdownMenuItem>
          ) : (
            visibleOptions.map(opt => (
              <DropdownMenuCheckboxItem
                key={opt}
                checked={value.includes(opt)}
                disabled={disabled}
                onCheckedChange={() => toggle(opt)}
                onSelect={event => event.preventDefault()}
              >
                {opt}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </div>
        {value.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={disabled}
              onSelect={() => onChange([])}
            >
              Clear {label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
```

- [ ] **Step 2: Use it in EndpointsClient**

In `src/app/(app)/endpoints/EndpointsClient.tsx`:
1. Delete the inline `FilterSubmenu` function (lines 80-163, including the `// ─── Filter submenu ───` comment banner).
2. Add `import { FilterSubmenu } from '@/components/FilterSubmenu'`.
3. From the `@/components/ui/dropdown-menu` import block, remove the now-unused names: `DropdownMenuCheckboxItem`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger`. Keep `DropdownMenu`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuTrigger` (still used by the filter menu shell). Remove the `Input` import if nothing else in the file uses it (search first — as of writing, the only `Input` usage is inside FilterSubmenu).

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit && bun run lint`
Expected: both exit 0 (lint will catch any unused import left behind).

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterSubmenu.tsx src/app/\(app\)/endpoints/EndpointsClient.tsx
git commit -m "refactor(endpoints): extract FilterSubmenu into shared component"
```

---

### Task 8: The EPG page — RSC, client, detail panel

**Files:**
- Modify (full rewrite): `src/app/(app)/epgs/page.tsx`
- Modify: `src/app/(app)/epgs/layout.tsx` (metadata copy only)
- Create: `src/app/(app)/epgs/EpgsClient.tsx`
- Create: `src/app/(app)/epgs/EpgDetailPanel.tsx`

**Interfaces:**
- Consumes: query helpers + types from `@/lib/epgs/query` (Task 6), `sortBindingRows` from `./sort` (Task 6), `FilterSubmenu` (Task 7), `POST /api/epgs/resync` (Task 4), `getApicHosts`/`SafeApicHost` from `@/actions/apic-hosts`, `ApicCredentialDialog` from `@/components/ApicCredentialDialog`, ui classes from `@/lib/ui-classes`.
- Produces: the `/epgs` route. URL params: `apic`, `view` (`epg`|`port`, default `epg`), `query`, `page`, `pageSize` (10/50/100/1000/all, default 50), `tenant`, `ap`, `node`, `presence` (comma-separated multi-values).

Data-volume note: the By Port view fetches **all** matching bindings, natural-sorts server-side, then slices the page — lexicographic DB ordering would put `eth1/10` before `eth1/2`, and static bindings per host are at most a few thousand rows, so a full fetch is fine. The By EPG view uses normal skip/take with DB `orderBy: [{ tenant: 'asc' }, { name: 'asc' }]`.

- [ ] **Step 1: Update layout metadata**

Replace the `metadata` in `src/app/(app)/epgs/layout.tsx`:

```typescript
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'EPG',
  description: 'Deployed EPGs and their static port bindings across the fabric.',
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
```

- [ ] **Step 2: Replace the mock page with the RSC**

Replace the entire contents of `src/app/(app)/epgs/page.tsx` with:

```typescript
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import {
  buildEpgWhere,
  buildBindingWhere,
  expandNodeOptions,
  type EpgPresenceFilter,
  type EpgWithBindings,
  type BindingWithEpg,
} from '@/lib/epgs/query'
import { sortBindingRows } from './sort'
import { EpgsClient } from './EpgsClient'

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = typeof VALID_PAGE_SIZES[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

function parseList(param: string | undefined): string[] {
  return param ? param.split(',').map(s => s.trim()).filter(Boolean) : []
}

export default async function EpgsPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string; view?: string; query?: string; page?: string; pageSize?: string
    tenant?: string; ap?: string; node?: string; presence?: string
  }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const params = await searchParams
  const apicHosts = await getApicHosts()

  const view = params.view === 'port' ? 'port' as const : 'epg' as const
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const pageSize = parsePageSize(params.pageSize)
  const filterTenant = parseList(params.tenant)
  const filterAp = parseList(params.ap)
  const filterNode = parseList(params.node)
  const filterPresence = parseList(params.presence)
    .filter((s): s is EpgPresenceFilter => s === 'present' || s === 'absent')

  let epgs: EpgWithBindings[] = []
  let bindings: BindingWithEpg[] = []
  let total = 0
  let presentTotal = 0
  let absentTotal = 0
  let tenants: string[] = []
  let aps: string[] = []
  let nodeOptions: string[] = []
  let lastSyncAt: string | null = null

  const apic = params.apic
  if (apic && apicHosts.some(h => h.id === apic)) {
    const filters = {
      query: params.query,
      tenant: filterTenant,
      ap: filterAp,
      presence: filterPresence,
    }
    const skip = pageSize === 'all' ? 0 : (page - 1) * pageSize
    const take = pageSize === 'all' ? undefined : pageSize
    const hostWhere = { apicHostId: apic }

    const [host, tenantRows, apRows, nodeRows, presentCount, absentCount] = await Promise.all([
      prisma.apicHost.findFirst({ where: { id: apic }, select: { lastEpgSyncAt: true } }),
      prisma.epgSnapshot.findMany({
        where: hostWhere, select: { tenant: true }, distinct: ['tenant'], orderBy: { tenant: 'asc' },
      }),
      prisma.epgSnapshot.findMany({
        where: hostWhere, select: { appProfile: true }, distinct: ['appProfile'], orderBy: { appProfile: 'asc' },
      }),
      prisma.epgPathBinding.findMany({
        where: hostWhere, select: { node: true }, distinct: ['node'],
      }),
      // Header stats count the active view's entity (EPGs vs bindings).
      view === 'epg'
        ? prisma.epgSnapshot.count({ where: { ...hostWhere, present: true } })
        : prisma.epgPathBinding.count({ where: { ...hostWhere, present: true } }),
      view === 'epg'
        ? prisma.epgSnapshot.count({ where: { ...hostWhere, present: false } })
        : prisma.epgPathBinding.count({ where: { ...hostWhere, present: false } }),
    ])

    lastSyncAt = host?.lastEpgSyncAt?.toISOString() ?? null
    tenants = tenantRows.map(r => r.tenant).filter(Boolean)
    aps = apRows.map(r => r.appProfile).filter(Boolean)
    nodeOptions = expandNodeOptions(nodeRows.map(r => r.node).filter(Boolean))
    presentTotal = presentCount
    absentTotal = absentCount

    if (view === 'epg') {
      const where = buildEpgWhere(apic, filters)
      ;[epgs, total] = await Promise.all([
        prisma.epgSnapshot.findMany({
          where,
          orderBy: [{ tenant: 'asc' }, { name: 'asc' }],
          skip,
          take,
          include: { bindings: { orderBy: [{ node: 'asc' }, { port: 'asc' }] } },
        }),
        prisma.epgSnapshot.count({ where }),
      ])
    } else {
      const where = buildBindingWhere(apic, { ...filters, node: filterNode })
      // Fetch all matching rows and natural-sort server-side: DB text ordering
      // would put eth1/10 before eth1/2, and static bindings stay small enough
      // (at most a few thousand per host) for a full fetch.
      const allRows = await prisma.epgPathBinding.findMany({
        where,
        include: {
          epg: { select: { name: true, tenant: true, appProfile: true, dn: true, present: true } },
        },
      })
      const sorted = sortBindingRows(allRows)
      total = sorted.length
      bindings = take === undefined ? sorted : sorted.slice(skip, skip + take)
    }
  }

  return (
    <EpgsClient
      apicHosts={apicHosts}
      view={view}
      epgs={epgs}
      bindings={bindings}
      selectedHostId={apic ?? ''}
      query={params.query ?? ''}
      filterTenant={filterTenant}
      filterAp={filterAp}
      filterNode={filterNode}
      filterPresence={filterPresence}
      tenants={tenants}
      aps={aps}
      nodeOptions={nodeOptions}
      page={page}
      total={total}
      pageSize={pageSize}
      presentTotal={presentTotal}
      absentTotal={absentTotal}
      lastSyncAt={lastSyncAt}
    />
  )
}
```

- [ ] **Step 3: Create the detail panel**

Create `src/app/(app)/epgs/EpgDetailPanel.tsx`:

```typescript
'use client'

import { IconX } from '@tabler/icons-react'
import type { EpgWithBindings } from '@/lib/epgs/query'
import { sortBindingRows } from './sort'
import { MUTED_TABLE_HEAD_CLS } from '@/lib/ui-classes'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</p>
      <div className="text-xs text-foreground mt-1">{children}</div>
    </div>
  )
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-sm bg-muted border border-border px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground mr-1 mb-1">
      {children}
    </span>
  )
}

function Flag({ on }: { on: boolean }) {
  return (
    <span className={on ? 'text-success font-medium' : 'text-faint'}>
      {on ? 'Yes' : 'No'}
    </span>
  )
}

export function EpgDetailPanel({ epg, onClose }: { epg: EpgWithBindings; onClose: () => void }) {
  const bindings = sortBindingRows(epg.bindings)

  return (
    <>
      <div className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-20" onClick={onClose} />
      <aside className="animate-panel-in fixed top-0 right-0 z-30 flex h-full w-[480px] flex-col border-l border-border bg-card shadow-2xl">
        <div className="px-6 py-5 border-b border-subtle flex items-start justify-between shrink-0">
          <div className="min-w-0">
            <h2 className="font-serif text-base font-semibold text-foreground truncate">{epg.name}</h2>
            <p className="text-xs text-subtle mt-0.5 font-mono truncate" title={epg.dn}>
              {epg.tenant} / {epg.appProfile}
            </p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-muted-foreground transition-colors mt-0.5 shrink-0">
            <IconX size={16} stroke={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {epg.description && <Field label="Description">{epg.description}</Field>}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bridge Domain">
              <span className="font-mono">{epg.bridgeDomain || '—'}</span>
            </Field>
            <Field label="pcTag">
              <span className="font-mono tabular-nums">{epg.pcTag || '—'}</span>
            </Field>
            <Field label="Preferred Group"><Flag on={epg.preferredGroup} /></Field>
            <Field label="Intra-EPG Isolation"><Flag on={epg.isolation} /></Field>
          </div>

          <Field label="Domains">
            {epg.domains.length > 0 ? epg.domains.map(d => <Pill key={d}>{d}</Pill>) : <span className="text-faint">—</span>}
          </Field>
          <Field label="Provided Contracts">
            {epg.providedContracts.length > 0 ? epg.providedContracts.map(c => <Pill key={c}>{c}</Pill>) : <span className="text-faint">—</span>}
          </Field>
          <Field label="Consumed Contracts">
            {epg.consumedContracts.length > 0 ? epg.consumedContracts.map(c => <Pill key={c}>{c}</Pill>) : <span className="text-faint">—</span>}
          </Field>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-2">
              Port Bindings ({bindings.length})
            </p>
            {bindings.length === 0 ? (
              <p className="text-xs text-faint">No static port bindings.</p>
            ) : (
              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-subtle bg-muted">
                      {['Pod', 'Node', 'Port', 'Type', 'Encap', 'Mode'].map(h => (
                        <th key={h} className={MUTED_TABLE_HEAD_CLS}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bindings.map(b => (
                      <tr key={b.id} className={[
                        'border-b border-border-faint last:border-0',
                        b.present ? '' : 'opacity-50',
                      ].join(' ')}>
                        <td className="px-4 py-2 tabular-nums text-muted-foreground">{b.pod || '—'}</td>
                        <td className="px-4 py-2 tabular-nums text-foreground">{b.node || '—'}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground max-w-[140px] truncate" title={b.port}>{b.port}</td>
                        <td className="px-4 py-2 text-subtle uppercase text-[10px]">{b.pathType}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{b.encap || '—'}</td>
                        <td className="px-4 py-2 text-subtle">{b.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  )
}
```

- [ ] **Step 4: Create the client component**

Create `src/app/(app)/epgs/EpgsClient.tsx`:

```typescript
'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  IconRefresh, IconSearch, IconChevronLeft, IconChevronRight, IconServer, IconFilter2,
} from '@tabler/icons-react'
import type { SafeApicHost } from '@/actions/apic-hosts'
import {
  countActiveEpgFilterGroups,
  type EpgPresenceFilter,
  type EpgWithBindings,
  type BindingWithEpg,
} from '@/lib/epgs/query'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { FilterSubmenu } from '@/components/FilterSubmenu'
import { ApicCredentialDialog } from '@/components/ApicCredentialDialog'
import { EpgDetailPanel } from './EpgDetailPanel'

type ViewValue = 'epg' | 'port'
type PageSizeValue = 10 | 50 | 100 | 1000 | 'all'
const PAGE_SIZE_OPTIONS: { label: string; value: PageSizeValue }[] = [
  { label: '10', value: 10 },
  { label: '50', value: 50 },
  { label: '100', value: 100 },
  { label: '1000', value: 1000 },
  { label: 'All', value: 'all' },
]

function fmt(date: string | Date | null) {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

function PresentBadge({ present }: { present: boolean }) {
  return (
    <span className={[
      'flex items-center gap-1.5 text-[10px] font-medium',
      present ? 'text-success' : 'text-faint',
    ].join(' ')}>
      <span className={[
        'w-1.5 h-1.5 rounded-full shrink-0',
        present ? 'bg-success-dot' : 'bg-border',
      ].join(' ')} />
      {present ? 'Present' : 'Removed'}
    </span>
  )
}

interface Props {
  apicHosts: SafeApicHost[]
  view: ViewValue
  epgs: EpgWithBindings[]
  bindings: BindingWithEpg[]
  selectedHostId: string
  query: string
  filterTenant: string[]
  filterAp: string[]
  filterNode: string[]
  filterPresence: EpgPresenceFilter[]
  tenants: string[]
  aps: string[]
  nodeOptions: string[]
  page: number
  total: number
  pageSize: PageSizeValue
  presentTotal: number
  absentTotal: number
  lastSyncAt: string | null
}

export function EpgsClient({
  apicHosts, view, epgs, bindings, selectedHostId, query,
  filterTenant, filterAp, filterNode, filterPresence,
  tenants, aps, nodeOptions,
  page, total, pageSize, presentTotal, absentTotal, lastSyncAt,
}: Props) {
  const router = useRouter()
  const [syncing, setSyncing] = useState(false)
  const [credentialOpen, setCredentialOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastDispatchedQuery = useRef(query)
  const [searchValue, setSearchValue] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)
  const [selectedEpgId, setSelectedEpgId] = useState<string | null>(null)

  // Sync input on back/forward navigation, ignoring our own debounced echo.
  if (query !== previousQuery) {
    setPreviousQuery(query)
    if (query !== lastDispatchedQuery.current) setSearchValue(query)
  }

  const effectivePageSize = pageSize === 'all' ? Math.max(total, 1) : pageSize
  const totalPages = Math.max(1, Math.ceil(total / effectivePageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * effectivePageSize + 1
  const rangeEnd = pageSize === 'all' ? total : Math.min(page * effectivePageSize, total)
  const activeFilterGroupCount = countActiveEpgFilterGroups({
    tenant: filterTenant, ap: filterAp, node: filterNode, presence: filterPresence,
  })
  const selectedHost = apicHosts.find(host => host.id === selectedHostId)
  const selectedEpg = epgs.find(e => e.id === selectedEpgId) ?? null
  const noun = view === 'epg' ? 'EPGs' : 'bindings'

  function buildUrl(overrides: {
    apic?: string; view?: ViewValue; query?: string; page?: number; pageSize?: PageSizeValue
    tenant?: string[]; ap?: string[]; node?: string[]; presence?: string[]
  }) {
    const params = new URLSearchParams()
    const apic = overrides.apic ?? selectedHostId
    const v = overrides.view ?? view
    const q = overrides.query !== undefined ? overrides.query : query
    const p = overrides.page ?? page
    const ps = overrides.pageSize !== undefined ? overrides.pageSize : pageSize
    const ft = overrides.tenant !== undefined ? overrides.tenant : filterTenant
    const fa = overrides.ap !== undefined ? overrides.ap : filterAp
    const fn = overrides.node !== undefined ? overrides.node : filterNode
    const fp = overrides.presence !== undefined ? overrides.presence : filterPresence

    if (apic) params.set('apic', apic)
    if (v !== 'epg') params.set('view', v)
    if (q.trim()) params.set('query', q.trim())
    if (p > 1) params.set('page', String(p))
    if (ps !== 50) params.set('pageSize', String(ps))
    if (ft.length > 0) params.set('tenant', ft.join(','))
    if (fa.length > 0) params.set('ap', fa.join(','))
    if (fn.length > 0) params.set('node', fn.join(','))
    if (fp.length > 0 && fp.length < 2) params.set('presence', fp[0])
    const qs = params.toString()
    return `/epgs${qs ? `?${qs}` : ''}`
  }

  function navigate(url: string) {
    startTransition(() => { router.replace(url) })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      lastDispatchedQuery.current = value.trim()
      navigate(buildUrl({ query: value, page: 1 }))
    }, 300)
  }

  function handleFilterChange(key: 'tenant' | 'ap' | 'node' | 'presence', value: string[]) {
    navigate(buildUrl({ [key]: value, page: 1 }))
  }

  async function handleResync(credentials: { username: string; password: string }) {
    if (!selectedHostId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/epgs/resync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId: selectedHostId, ...credentials }),
      })
      const data = await res.json() as { syncedEpgs?: number; syncedBindings?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Resync failed')
      toast.success(`Synced ${data.syncedEpgs} EPGs (${data.syncedBindings} port bindings)`)
      startTransition(() => router.refresh())
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Resync failed')
    } finally {
      setSyncing(false)
    }
  }

  const loading = isPending || syncing

  return (
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">EPG</h1>
            <p className="text-xs text-subtle mt-0.5">Deployed EPGs and their static port bindings</p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedHostId}
              onChange={e => navigate(e.target.value ? `/epgs?apic=${e.target.value}` : '/epgs')}
              className="text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 min-w-[180px]"
            >
              <option value="">Select APIC host…</option>
              {apicHosts.map(h => (
                <option key={h.id} value={h.id}>{h.name} ({h.host})</option>
              ))}
            </select>

            <button
              onClick={() => setCredentialOpen(true)}
              disabled={!selectedHostId || syncing}
              title="Resync EPGs from APIC"
              className={[
                'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg transition-colors shadow-sm',
                selectedHostId && !syncing
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-faint cursor-not-allowed',
              ].join(' ')}
            >
              <IconRefresh size={12} stroke={1.75} className={loading ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : isPending ? 'Loading…' : 'Resync'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        {!selectedHostId ? (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="relative mb-6">
              <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center shadow-sm">
                <IconServer size={24} stroke={1.25} className="text-faint" />
              </div>
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-border border-2 border-background" />
            </div>
            <h2 className="font-serif text-base font-semibold text-foreground mb-1">
              No APIC host selected
            </h2>
            <p className="text-xs text-subtle mb-6 max-w-[260px] leading-relaxed">
              {apicHosts.length === 0
                ? 'No APIC hosts configured yet. Add one in Settings to get started.'
                : 'Choose a host to view its EPG inventory.'}
            </p>
          </div>
        ) : (
          <>
            {/* View toggle + search + filters + stats */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 min-w-0">
                {/* View toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
                  {([['epg', 'By EPG'], ['port', 'By Port']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      onClick={() => navigate(buildUrl({ view: v, page: 1 }))}
                      disabled={isPending}
                      className={[
                        'px-3 py-2 text-xs font-semibold transition-colors',
                        view === v
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="relative w-56 shrink-0">
                  <IconSearch size={13} stroke={1.75} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none" />
                  <input
                    type="text"
                    value={searchValue}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder={view === 'epg' ? 'Search EPG, tenant, BD…' : 'Search node, port, EPG…'}
                    className={SEARCH_INPUT_CLS}
                  />
                </div>

                {/* Filter menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title="Filter EPGs"
                      aria-label="Filter EPGs"
                      disabled={isPending}
                      className={[
                        'relative flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors outline-none',
                        'focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-40',
                        activeFilterGroupCount > 0
                          ? 'border-primary bg-primary/8 text-foreground'
                          : 'border-border bg-muted text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <IconFilter2 size={15} stroke={1.75} />
                      {activeFilterGroupCount > 0 && (
                        <span className="absolute -right-1.5 -top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground shadow-sm">
                          {activeFilterGroupCount}
                        </span>
                      )}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44" align="start">
                    <DropdownMenuLabel>Filters</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <FilterSubmenu label="Tenant" value={filterTenant} options={tenants} onChange={v => handleFilterChange('tenant', v)} disabled={isPending} searchable />
                    <FilterSubmenu label="App Profile" value={filterAp} options={aps} onChange={v => handleFilterChange('ap', v)} disabled={isPending} searchable />
                    {view === 'port' && (
                      <FilterSubmenu label="Node" value={filterNode} options={nodeOptions} onChange={v => handleFilterChange('node', v)} disabled={isPending} searchable />
                    )}
                    <FilterSubmenu label="Presence" value={filterPresence} options={['present', 'absent']} onChange={v => handleFilterChange('presence', v)} disabled={isPending} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-3 shrink-0 text-xs text-subtle">
                <span><span className="font-semibold text-success">{presentTotal}</span> present</span>
                <span className="text-border">·</span>
                <span><span className="font-semibold text-foreground">{absentTotal}</span> removed</span>
                <span className="text-border">·</span>
                <span title="Last EPG sync">synced {fmt(lastSyncAt)}</span>
              </div>
            </div>

            {/* Table */}
            <div className={[
              'bg-card border border-border rounded-2xl overflow-hidden shadow-sm',
              'transition-opacity duration-150',
              isPending ? 'opacity-60 pointer-events-none' : 'opacity-100',
            ].join(' ')}>
              {(view === 'epg' ? epgs.length : bindings.length) === 0 && !isPending ? (
                <div className="px-4 py-14 text-center">
                  {query || activeFilterGroupCount > 0 ? (
                    <>
                      <p className="text-sm text-subtle">No {noun} match the current filters</p>
                      <p className="text-xs text-faint mt-1">Try adjusting the search or filter values</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm text-subtle">No {noun} found</p>
                      <p className="text-xs text-faint mt-1">
                        Click <strong>Resync</strong> to pull the latest data from the APIC
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <div className={TABLE_SCROLL_CLS}>
                  {view === 'epg' ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['EPG', 'Tenant', 'App Profile', 'Bridge Domain', 'Ports', 'Contracts', 'Status'].map(h => (
                            <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {epgs.map(epg => (
                          <tr
                            key={epg.id}
                            onClick={() => setSelectedEpgId(epg.id)}
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 cursor-pointer"
                          >
                            <td className="px-4 py-2.5 font-mono font-medium text-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                              {epg.name}
                            </td>
                            <td className="px-4 py-2.5 text-muted-foreground">{epg.tenant}</td>
                            <td className="px-4 py-2.5 font-mono text-subtle text-[11px]">{epg.appProfile}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{epg.bridgeDomain || '—'}</td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {epg.bindings.length > 0
                                ? <span className="font-medium text-foreground">{epg.bindings.length}</span>
                                : <span className="text-faint">0</span>}
                            </td>
                            <td className="px-4 py-2.5 tabular-nums">
                              {epg.providedContracts.length + epg.consumedContracts.length > 0
                                ? <span className="font-medium text-foreground">{epg.providedContracts.length + epg.consumedContracts.length}</span>
                                : <span className="text-faint">0</span>}
                            </td>
                            <td className="px-4 py-2.5"><PresentBadge present={epg.present} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          {['Node', 'Port', 'Type', 'Encap', 'Mode', 'EPG', 'Tenant', 'Status'].map(h => (
                            <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bindings.map(b => (
                          <tr
                            key={b.id}
                            className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100"
                          >
                            <td className="px-4 py-2.5 tabular-nums text-foreground border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                              {b.node || '—'}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground max-w-[180px] truncate" title={b.port}>{b.port}</td>
                            <td className="px-4 py-2.5 text-subtle uppercase text-[10px]">{b.pathType}</td>
                            <td className="px-4 py-2.5 font-mono text-muted-foreground">{b.encap || '—'}</td>
                            <td className="px-4 py-2.5 text-subtle">{b.mode}</td>
                            <td className="px-4 py-2.5 font-mono text-foreground max-w-[200px] truncate" title={b.epg.dn}>{b.epg.name}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{b.epg.tenant}</td>
                            <td className="px-4 py-2.5"><PresentBadge present={b.present} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>

            {/* Pagination */}
            {total > 0 && (
              <div className="flex items-center justify-between pt-1 gap-4">
                <p className="text-xs text-subtle shrink-0">
                  {pageSize === 'all'
                    ? `Showing all ${total} ${noun}`
                    : `Showing ${rangeStart}–${rangeEnd} of ${total} ${noun}`}
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-faint">Per page</span>
                    <select
                      value={String(pageSize)}
                      onChange={e => navigate(buildUrl({ pageSize: e.target.value === 'all' ? 'all' : Number(e.target.value) as PageSizeValue, page: 1 }))}
                      disabled={isPending}
                      className="text-xs bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:opacity-40"
                    >
                      {PAGE_SIZE_OPTIONS.map(o => (
                        <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  {pageSize !== 'all' && totalPages > 1 && (
                    <>
                      <div className="w-px h-4 bg-border" />
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate(buildUrl({ page: page - 1 }))}
                          disabled={page <= 1 || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <IconChevronLeft size={12} stroke={1.75} />
                          Prev
                        </button>
                        <span className="px-2 py-1.5 text-xs text-subtle tabular-nums">{page} / {totalPages}</span>
                        <button
                          onClick={() => navigate(buildUrl({ page: page + 1 }))}
                          disabled={page >= totalPages || isPending}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-border text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Next
                          <IconChevronRight size={12} stroke={1.75} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedEpg && (
        <EpgDetailPanel epg={selectedEpg} onClose={() => setSelectedEpgId(null)} />
      )}

      <ApicCredentialDialog
        open={credentialOpen}
        onOpenChange={setCredentialOpen}
        title="Resync EPGs"
        description={`Enter APIC credentials for ${selectedHost?.name ?? 'the selected host'}. Credentials are used for this resync only.`}
        onSubmit={handleResync}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify**

Run: `bunx tsc --noEmit && bun run lint && bun test`
Expected: all exit 0. If `tsc` flags mismatches against the actual generated Prisma types or ui-class exports, fix the page code (not the generated types).

- [ ] **Step 6: Manual smoke check**

Run: `bun run dev` and open `http://localhost:3000/epgs`.
Expected: page renders the "No APIC host selected" empty state; selecting a host renders an empty table with the Resync hint; no console errors. (Full data verification happens against a live APIC in Task 10.)

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/epgs
git commit -m "feat(epgs): add EPG inventory page with by-EPG and by-port views"
```

---

### Task 9: Sidebar entry

**Files:**
- Modify: `src/components/AppSidebar.tsx` (icon imports at lines 45-64; Infrastructure group at lines 94-129)

**Interfaces:**
- Consumes: existing `NAV` structure.
- Produces: an "EPG" item in the Infrastructure group linking `/epgs`.

- [ ] **Step 1: Add the nav item**

In `src/components/AppSidebar.tsx`, add `IconTopologyStar3` to the `@tabler/icons-react` import list, then insert into the Infrastructure group's `items`, directly after the Endpoints entry:

```tsx
      {
        href: "/epgs",
        label: "EPG",
        icon: <IconTopologyStar3 size={15} stroke={1.75} />,
      },
```

- [ ] **Step 2: Verify**

Run: `bunx tsc --noEmit && bun run lint`
Expected: exit 0. Optionally confirm in the dev server that "EPG" appears between Endpoints and Interfaces and highlights when active.

- [ ] **Step 3: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat(sidebar): add EPG page to Infrastructure section"
```

---

### Task 10: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all tests pass, including the pre-existing suites (endpoints, nodes, faults, cron-resync, csv, parallel, paths).

- [ ] **Step 2: Lint and build**

Run: `bun run lint && bun run build`
Expected: both exit 0. The build compiles `/epgs` and `/api/epgs/resync` routes.

- [ ] **Step 3: Manual end-to-end check (requires a reachable APIC)**

1. `bun run dev`, sign in, open Infrastructure → EPG.
2. Select an APIC host, click Resync, enter credentials.
3. Expected: success toast "Synced N EPGs (M port bindings)"; By EPG table fills in; clicking a row opens the detail panel with BD, policy flags, domains, contracts, and bindings; switching to By Port lists bindings natural-sorted by node/port; vPC bindings show a `101-102`-style node pair with type VPC; filters and pagination update the URL and results.
4. Check the History page shows a `resync.epgs` audit entry.

If no APIC is reachable, verify instead with a manual `curl -X POST http://localhost:3000/api/epgs/resync` (expect 401 without a session cookie — confirms the route is wired) and note the live check as pending.

- [ ] **Step 4: Wrap up**

Use the superpowers:finishing-a-development-branch skill to decide merge/PR handling for the `dev` branch work.

---

## Self-Review Notes

- Spec coverage: data model (Task 1), collector + vPC parsing (Task 2), resync upsert/mark-absent + advisory lock + lastEpgSyncAt (Task 3), manual resync API + audit (Task 4), cron dataset + partial status (Task 5), node-filter leaf matching + natural sort (Task 6), by-EPG/by-port views + detail panel + filters + pagination + resync toolbar + empty states (Tasks 7-8), sidebar (Task 9), out-of-scope items (no create/edit UI, no fvIfConn, no lifecycle diffing) respected throughout.
- Type consistency: `EpgRow`/`EpgBindingRow` (Task 2) feed `executeEpgResyncWrites` (Task 3); `ResyncEpgsResult {syncedEpgs, syncedBindings}` is used by the route (Task 4), cron (Task 5), and the client toast (Task 8); `EpgWithBindings`/`BindingWithEpg`/`EpgPresenceFilter` (Task 6) are shared by page and client (Task 8); `FilterSubmenu` props (Task 7) match both call sites.
