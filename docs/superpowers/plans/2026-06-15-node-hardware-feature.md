# Node & Hardware Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collect Cisco ACI fabric node inventory + PSU/fan hardware health from APIC on the existing manual + scheduled resync flows, store them with history, and report node status + hardware health on a new `/nodes` page (headline + light trend + Nodes/Components view toggle), plus a dashboard tile.

**Architecture:** Mirror the Faults/Health Scores collector — a `resyncNodes` lib (APIC login → four GET class queries → chunked upsert of two snapshot models `NodeSnapshot` + `HardwareComponent` + one `NodeStatusSample` per resync), an authed `POST /api/nodes/resync` route, cron wiring, a server-component page. Sources: `fabricNode` (identity), `topSystem` (operational), `eqptPsu`, `eqptFan`. Read-only.

**Tech Stack:** Next.js (App Router, server components), Prisma + SQLite, better-auth, recharts + shadcn chart primitives, bun test.

**Reference template (read these — the new code mirrors them):**
- `src/lib/apic/health-scores.ts`, `src/app/api/health-scores/resync/route.ts`
- `src/app/(app)/health-scores/page.tsx`, `src/app/(app)/health-scores/HealthScoresClient.tsx`, `src/app/(app)/health-scores/sort.ts`
- `src/actions/health-scores.ts`, `src/app/(app)/dashboard/HealthTile.tsx`
- `src/lib/apic/cron-resync.ts`, `src/app/api/cron/resync/route.ts`

---

## File Structure

**Create:**
- `src/lib/apic/nodes.ts` — types, parse/merge/health helpers, `summarizeNodes`, `fetchNodesFromApic`, `resyncNodes`
- `src/lib/apic/nodes.test.ts` — parse / merge / health / summarize unit tests
- `src/app/api/nodes/resync/route.ts` — manual resync endpoint
- `src/app/(app)/nodes/page.tsx` — server component
- `src/app/(app)/nodes/NodesClient.tsx` — headline + trend + Nodes/Components view toggle
- `src/app/(app)/nodes/sort.ts` — `sortNodeRows`, `sortComponentRows`
- `src/app/(app)/nodes/sort.test.ts` — sort tests
- `src/actions/nodes.ts` — `getNodeSummary` server action for the dashboard tile
- `src/app/(app)/dashboard/NodesTile.tsx` — dashboard summary tile

**Modify:**
- `prisma/schema.prisma` — add `NodeSnapshot`, `HardwareComponent`, `NodeStatusSample`, `ApicHost.lastNodeSyncAt` + relations
- `src/lib/audit.ts` — add `'resync.nodes'` action
- `src/app/(app)/history/HistoryClient.tsx` — add `'resync.nodes'` to `ACTION_LABELS`
- `src/lib/apic/cron-resync.ts` — add `nodes` to `HostResult` + `summarizeResults`
- `src/lib/apic/cron-resync.test.ts` — cover the nodes dataset
- `src/app/api/cron/resync/route.ts` — add the Nodes dataset block
- `src/components/AppSidebar.tsx` — add the Nodes nav entry
- `src/app/(app)/dashboard/page.tsx` — render `NodesTile`

---

## Task 1: Prisma schema — node + hardware models

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `lastNodeSyncAt` and relations to `ApicHost`**

In the `ApicHost` model, add the field next to `lastHealthSyncAt` and three back-relations next to `healthScores` / `healthSamples`:

```prisma
  lastHealthSyncAt    DateTime?
  lastNodeSyncAt      DateTime?
  endpoints           Endpoint[]
  interfaces          InterfaceSnapshot[]
  faults              FaultSnapshot[]
  faultCounts         FaultCountSample[]
  healthScores        HealthScoreSnapshot[]
  healthSamples       HealthScoreSample[]
  nodes               NodeSnapshot[]
  hardware            HardwareComponent[]
  nodeSamples         NodeStatusSample[]
```

(Preserve other existing fields; only add the one field + three relations. Match the column alignment in the file.)

- [ ] **Step 2: Append the three models** after `HealthScoreSample`:

```prisma
model NodeSnapshot {
  id          String   @id @default(cuid())
  apicHostId  String
  apicHost    ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn          String
  nodeId      String
  name        String   @default("")
  role        String   @default("")
  model       String   @default("")
  serial      String   @default("")
  version     String?
  fabricSt    String   @default("")
  state       String?
  podId       String?
  uptime      String?
  oobMgmtAddr String?
  present     Boolean  @default(true)
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  @@unique([apicHostId, dn])
  @@index([apicHostId])
  @@index([apicHostId, role])
  @@map("node_snapshot")
}

model HardwareComponent {
  id          String   @id @default(cuid())
  apicHostId  String
  apicHost    ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  dn          String
  nodeId      String
  type        String
  name        String   @default("")
  operSt      String   @default("")
  healthy     Boolean  @default(true)
  model       String   @default("")
  serial      String   @default("")
  present     Boolean  @default(true)
  firstSeenAt DateTime @default(now())
  lastSeenAt  DateTime @default(now())

  @@unique([apicHostId, dn])
  @@index([apicHostId, nodeId])
  @@index([apicHostId, type])
  @@map("hardware_component")
}

model NodeStatusSample {
  id               String   @id @default(cuid())
  apicHostId       String
  apicHost         ApicHost @relation(fields: [apicHostId], references: [id], onDelete: Cascade)
  sampledAt        DateTime @default(now())
  nodesTotal       Int
  nodesOnline      Int
  componentsTotal  Int
  componentsFailed Int

  @@index([apicHostId, sampledAt])
  @@map("node_status_sample")
}
```

Note: `HardwareComponent.healthy` is a stored boolean (computed via `isComponentHealthy` at resync time) so the page/dashboard can count failed components with a DB query instead of loading every row.

- [ ] **Step 3: Create the migration and regenerate the client**

Run: `bunx prisma migrate dev --name add_nodes`
Expected: a new folder `prisma/migrations/*_add_nodes`, and "Generated Prisma Client" output.

- [ ] **Step 4: Verify no new type errors**

Run: `bunx tsc --noEmit 2>&1 | grep -iE "nodesnapshot|hardwarecomponent|nodestatussample" || echo "no node type errors"`
Expected: `no node type errors`. (The repo has ~26 pre-existing unrelated tsc errors — ignore those.)

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add NodeSnapshot, HardwareComponent, NodeStatusSample models"
```

---

## Task 2: Node parse + merge helpers

**Files:**
- Create: `src/lib/apic/nodes.ts`
- Test: `src/lib/apic/nodes.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/apic/nodes.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import {
  parseFabricNodeRows,
  parseTopSystemRows,
  mergeNodes,
  type FabricNodeMo,
  type TopSystemMo,
} from './nodes'

describe('parseFabricNodeRows', () => {
  it('maps fabricNode attributes and derives podId', () => {
    const imdata: FabricNodeMo[] = [
      {
        fabricNode: {
          attributes: {
            dn: 'topology/pod-1/node-101',
            id: '101', name: 'leaf-101', role: 'leaf',
            model: 'N9K-C93180', serial: 'FDO123', fabricSt: 'active',
          },
        },
      },
    ]
    const [row] = parseFabricNodeRows(imdata)
    expect(row.dn).toBe('topology/pod-1/node-101')
    expect(row.nodeId).toBe('101')
    expect(row.name).toBe('leaf-101')
    expect(row.role).toBe('leaf')
    expect(row.serial).toBe('FDO123')
    expect(row.fabricSt).toBe('active')
    expect(row.podId).toBe('1')
    expect(row.version).toBeNull()
  })

  it('falls back to ser when serial is absent', () => {
    const imdata: FabricNodeMo[] = [
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-1', id: '1', ser: 'ABC' } } },
    ]
    expect(parseFabricNodeRows(imdata)[0].serial).toBe('ABC')
  })
})

describe('parseTopSystemRows', () => {
  it('builds a map keyed by node id with operational fields', () => {
    const imdata: TopSystemMo[] = [
      {
        topSystem: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys', id: '101',
            state: 'in-service', version: 'n9000-15.2', systemUpTime: '01:02:03:04.00',
            oobMgmtAddr: '10.0.0.1', podId: '1',
          },
        },
      },
    ]
    const map = parseTopSystemRows(imdata)
    expect(map.get('101')).toEqual({
      version: 'n9000-15.2', state: 'in-service',
      uptime: '01:02:03:04.00', oobMgmtAddr: '10.0.0.1', podId: '1',
    })
  })
})

describe('mergeNodes', () => {
  it('fills operational fields from the topSystem map when present', () => {
    const fabricNodes = parseFabricNodeRows([
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-101', id: '101', role: 'leaf', fabricSt: 'active' } } },
    ])
    const topMap = parseTopSystemRows([
      { topSystem: { attributes: { dn: 'topology/pod-1/node-101/sys', id: '101', state: 'in-service', version: 'v1', systemUpTime: 'up', oobMgmtAddr: '10.0.0.1', podId: '1' } } },
    ])
    const [row] = mergeNodes(fabricNodes, topMap)
    expect(row.version).toBe('v1')
    expect(row.state).toBe('in-service')
    expect(row.uptime).toBe('up')
    expect(row.oobMgmtAddr).toBe('10.0.0.1')
  })

  it('leaves operational fields null when no topSystem entry exists', () => {
    const fabricNodes = parseFabricNodeRows([
      { fabricNode: { attributes: { dn: 'topology/pod-1/node-200', id: '200', fabricSt: 'inactive' } } },
    ])
    const [row] = mergeNodes(fabricNodes, new Map())
    expect(row.version).toBeNull()
    expect(row.state).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/nodes.test.ts`
Expected: FAIL — cannot find module `./nodes`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/apic/nodes.ts`:

```typescript
import { prisma } from '@/lib/prisma'
import { apicFetch, apicLogin } from './client'

export interface NodeRow {
  dn: string
  nodeId: string
  name: string
  role: string
  model: string
  serial: string
  version: string | null
  fabricSt: string
  state: string | null
  podId: string | null
  uptime: string | null
  oobMgmtAddr: string | null
}

export interface ComponentRow {
  dn: string
  nodeId: string
  type: 'psu' | 'fan'
  name: string
  operSt: string
  model: string
  serial: string
}

export interface FabricNodeMo {
  fabricNode?: { attributes: Record<string, string> }
}
export interface TopSystemMo {
  topSystem?: { attributes: Record<string, string> }
}
export interface EqptPsuMo {
  eqptPsu?: { attributes: Record<string, string> }
}
export interface EqptFanMo {
  eqptFan?: { attributes: Record<string, string> }
}

export interface TopSystemFields {
  version: string | null
  state: string | null
  uptime: string | null
  oobMgmtAddr: string | null
  podId: string | null
}

const NODE_RE = /node-(\d+)\b/
const POD_RE = /pod-(\d+)\b/

function nodeIdFromDn(dn: string): string {
  return NODE_RE.exec(dn)?.[1] ?? ''
}

function podIdFromDn(dn: string): string | null {
  return POD_RE.exec(dn)?.[1] ?? null
}

export function parseFabricNodeRows(imdata: FabricNodeMo[]): NodeRow[] {
  const rows: NodeRow[] = []
  for (const item of imdata) {
    const mo = item.fabricNode
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: a.id ?? nodeIdFromDn(a.dn),
      name: a.name ?? '',
      role: a.role ?? '',
      model: a.model ?? '',
      serial: a.serial ?? a.ser ?? '',
      version: null,
      fabricSt: a.fabricSt ?? '',
      state: null,
      podId: podIdFromDn(a.dn),
      uptime: null,
      oobMgmtAddr: null,
    })
  }
  return rows
}

export function parseTopSystemRows(imdata: TopSystemMo[]): Map<string, TopSystemFields> {
  const map = new Map<string, TopSystemFields>()
  for (const item of imdata) {
    const mo = item.topSystem
    if (!mo) continue
    const a = mo.attributes
    const id = a.id ?? nodeIdFromDn(a.dn)
    if (!id) continue
    map.set(id, {
      version: a.version ?? null,
      state: a.state ?? null,
      uptime: a.systemUpTime ?? null,
      oobMgmtAddr: a.oobMgmtAddr ?? null,
      podId: a.podId ?? null,
    })
  }
  return map
}

export function mergeNodes(
  fabricNodes: NodeRow[],
  topSystemByNode: Map<string, TopSystemFields>,
): NodeRow[] {
  return fabricNodes.map(node => {
    const top = topSystemByNode.get(node.nodeId)
    if (!top) return node
    return {
      ...node,
      version: top.version,
      state: top.state,
      uptime: top.uptime,
      oobMgmtAddr: top.oobMgmtAddr,
      podId: node.podId ?? top.podId,
    }
  })
}
```

Note: the `prisma`, `apicFetch`, `apicLogin` imports are unused until Task 4 (same file). Keep them — `bun test` doesn't run ESLint. (If the project's build treats unused imports as a hard error blocking `bun test`, omit them and report; Task 4 re-adds them.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/nodes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/nodes.ts src/lib/apic/nodes.test.ts
git commit -m "feat: add node parse and merge helpers"
```

---

## Task 3: Component parse + health/summary helpers

**Files:**
- Modify: `src/lib/apic/nodes.ts`
- Test: `src/lib/apic/nodes.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/apic/nodes.test.ts`. Add the new symbols to the existing `./nodes` import (or a new import line — keep it clean, no duplicate symbols):

```typescript
import {
  parsePsuRows,
  parseFanRows,
  isNodeOnline,
  isComponentHealthy,
  summarizeNodes,
  type EqptPsuMo,
  type EqptFanMo,
  type NodeRow,
  type ComponentRow,
} from './nodes'

describe('parsePsuRows', () => {
  it('maps eqptPsu to a psu component row with node id from dn', () => {
    const imdata: EqptPsuMo[] = [
      {
        eqptPsu: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/ch/psuslot-1/psu',
            id: '1', operSt: 'on', model: 'NXA-PAC-650', ser: 'PSU123',
          },
        },
      },
    ]
    const [row] = parsePsuRows(imdata)
    expect(row.type).toBe('psu')
    expect(row.nodeId).toBe('101')
    expect(row.name).toBe('1')
    expect(row.operSt).toBe('on')
    expect(row.serial).toBe('PSU123')
  })
})

describe('parseFanRows', () => {
  it('maps eqptFan to a fan component row', () => {
    const imdata: EqptFanMo[] = [
      {
        eqptFan: {
          attributes: {
            dn: 'topology/pod-1/node-101/sys/ch/ftslot-1/ft/fan-1',
            id: '1', operSt: 'ok', model: 'NXA-FAN',
          },
        },
      },
    ]
    const [row] = parseFanRows(imdata)
    expect(row.type).toBe('fan')
    expect(row.nodeId).toBe('101')
    expect(row.operSt).toBe('ok')
  })
})

describe('isNodeOnline', () => {
  it('is true only when fabricSt is active', () => {
    expect(isNodeOnline({ fabricSt: 'active' } as NodeRow)).toBe(true)
    expect(isNodeOnline({ fabricSt: 'inactive' } as NodeRow)).toBe(false)
  })
})

describe('isComponentHealthy', () => {
  it('treats on/ok as healthy (case-insensitive), others as failed', () => {
    expect(isComponentHealthy('psu', 'on')).toBe(true)
    expect(isComponentHealthy('psu', 'OK')).toBe(true)
    expect(isComponentHealthy('psu', 'shut')).toBe(false)
    expect(isComponentHealthy('fan', 'ok')).toBe(true)
    expect(isComponentHealthy('fan', 'fail')).toBe(false)
  })
})

describe('summarizeNodes', () => {
  it('counts online nodes and failed components', () => {
    const nodes = [
      { fabricSt: 'active' }, { fabricSt: 'active' }, { fabricSt: 'inactive' },
    ] as NodeRow[]
    const components = [
      { type: 'psu', operSt: 'on' }, { type: 'psu', operSt: 'shut' },
      { type: 'fan', operSt: 'ok' },
    ] as ComponentRow[]
    expect(summarizeNodes(nodes, components)).toEqual({
      nodesTotal: 3, nodesOnline: 2, componentsTotal: 3, componentsFailed: 1,
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/nodes.test.ts`
Expected: FAIL — new exports not found.

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/apic/nodes.ts`:

```typescript
export function parsePsuRows(imdata: EqptPsuMo[]): ComponentRow[] {
  const rows: ComponentRow[] = []
  for (const item of imdata) {
    const mo = item.eqptPsu
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: nodeIdFromDn(a.dn),
      type: 'psu',
      name: a.id ?? '',
      operSt: a.operSt ?? '',
      model: a.model ?? '',
      serial: a.ser ?? a.serial ?? '',
    })
  }
  return rows
}

export function parseFanRows(imdata: EqptFanMo[]): ComponentRow[] {
  const rows: ComponentRow[] = []
  for (const item of imdata) {
    const mo = item.eqptFan
    if (!mo) continue
    const a = mo.attributes
    rows.push({
      dn: a.dn,
      nodeId: nodeIdFromDn(a.dn),
      type: 'fan',
      name: a.id ?? '',
      operSt: a.operSt ?? '',
      model: a.model ?? '',
      serial: a.ser ?? a.serial ?? '',
    })
  }
  return rows
}

export function isNodeOnline(node: Pick<NodeRow, 'fabricSt'>): boolean {
  return node.fabricSt === 'active'
}

const HEALTHY_OPER_ST = new Set(['on', 'ok'])

export function isComponentHealthy(
  _type: ComponentRow['type'],
  operSt: string,
): boolean {
  return HEALTHY_OPER_ST.has(operSt.toLowerCase())
}

export interface NodeSummary {
  nodesTotal: number
  nodesOnline: number
  componentsTotal: number
  componentsFailed: number
}

export function summarizeNodes(nodes: NodeRow[], components: ComponentRow[]): NodeSummary {
  return {
    nodesTotal: nodes.length,
    nodesOnline: nodes.filter(isNodeOnline).length,
    componentsTotal: components.length,
    componentsFailed: components.filter(c => !isComponentHealthy(c.type, c.operSt)).length,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/nodes.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/nodes.ts src/lib/apic/nodes.test.ts
git commit -m "feat: add component parse, health, and summarize helpers"
```

---

## Task 4: `fetchNodesFromApic` + `resyncNodes`

Integration layer — no new unit test (matches `faults.ts` / `health-scores.ts`).

**Files:**
- Modify: `src/lib/apic/nodes.ts`

- [ ] **Step 1: Add the fetch function**

Append to `src/lib/apic/nodes.ts`:

```typescript
async function getJson<T>(host: string, token: string, path: string): Promise<T[]> {
  const res = await apicFetch(host, path, { token })
  if (!res.ok) throw new Error(`APIC GET ${path} failed: ${res.status}`)
  const data = (await res.json()) as { imdata?: T[] }
  return data.imdata ?? []
}

export async function fetchNodesFromApic(
  host: string,
  username: string,
  plaintextPassword: string,
): Promise<{ nodes: NodeRow[]; components: ComponentRow[] }> {
  const token = await apicLogin(host, username, plaintextPassword)
  const [fabricNodes, topSystem, psus, fans] = await Promise.all([
    getJson<FabricNodeMo>(host, token, '/api/node/class/fabricNode.json'),
    getJson<TopSystemMo>(host, token, '/api/node/class/topSystem.json'),
    getJson<EqptPsuMo>(host, token, '/api/node/class/eqptPsu.json'),
    getJson<EqptFanMo>(host, token, '/api/node/class/eqptFan.json'),
  ])
  const nodes = mergeNodes(parseFabricNodeRows(fabricNodes), parseTopSystemRows(topSystem))
  const components = [...parsePsuRows(psus), ...parseFanRows(fans)]
  return { nodes, components }
}
```

- [ ] **Step 2: Add the resync function**

Append to `src/lib/apic/nodes.ts`:

```typescript
const NODES_CHUNK_SIZE = 100

export interface ResyncNodesArgs {
  apicHostId: string
  host: string
  username: string
  password: string
}

export interface ResyncNodesResult {
  syncedNodes: number
  syncedComponents: number
  nodesOnline: number
}

/**
 * Fetch node inventory + PSU/fan components from APIC and persist them for one host.
 * Upserts NodeSnapshot and HardwareComponent (both with present-detection), then
 * records one NodeStatusSample for the trend.
 */
export async function resyncNodes(args: ResyncNodesArgs): Promise<ResyncNodesResult> {
  const { apicHostId, host, username, password } = args

  const { nodes, components } = await fetchNodesFromApic(host, username, password)

  const nodeMap = new Map<string, NodeRow>()
  for (const n of nodes) if (n.dn) nodeMap.set(n.dn, n)
  const uniqueNodes = Array.from(nodeMap.values())

  const compMap = new Map<string, ComponentRow>()
  for (const c of components) if (c.dn) compMap.set(c.dn, c)
  const uniqueComponents = Array.from(compMap.values())

  const now = new Date()

  // Phase 1: upsert NodeSnapshot rows (chunked).
  for (let i = 0; i < uniqueNodes.length; i += NODES_CHUNK_SIZE) {
    const chunk = uniqueNodes.slice(i, i + NODES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(n =>
        prisma.nodeSnapshot.upsert({
          where: { apicHostId_dn: { apicHostId, dn: n.dn } },
          update: {
            nodeId: n.nodeId, name: n.name, role: n.role, model: n.model,
            serial: n.serial, version: n.version, fabricSt: n.fabricSt,
            state: n.state, podId: n.podId, uptime: n.uptime,
            oobMgmtAddr: n.oobMgmtAddr, present: true, lastSeenAt: now,
          },
          create: {
            apicHostId, dn: n.dn, nodeId: n.nodeId, name: n.name, role: n.role,
            model: n.model, serial: n.serial, version: n.version, fabricSt: n.fabricSt,
            state: n.state, podId: n.podId, uptime: n.uptime, oobMgmtAddr: n.oobMgmtAddr,
            present: true, firstSeenAt: now, lastSeenAt: now,
          },
        }),
      ),
    )
  }
  await prisma.nodeSnapshot.updateMany({
    where: { apicHostId, present: true, dn: { notIn: uniqueNodes.map(n => n.dn) } },
    data: { present: false },
  })

  // Phase 2: upsert HardwareComponent rows (chunked), with stored `healthy`.
  for (let i = 0; i < uniqueComponents.length; i += NODES_CHUNK_SIZE) {
    const chunk = uniqueComponents.slice(i, i + NODES_CHUNK_SIZE)
    await prisma.$transaction(
      chunk.map(c =>
        prisma.hardwareComponent.upsert({
          where: { apicHostId_dn: { apicHostId, dn: c.dn } },
          update: {
            nodeId: c.nodeId, type: c.type, name: c.name, operSt: c.operSt,
            healthy: isComponentHealthy(c.type, c.operSt), model: c.model,
            serial: c.serial, present: true, lastSeenAt: now,
          },
          create: {
            apicHostId, dn: c.dn, nodeId: c.nodeId, type: c.type, name: c.name,
            operSt: c.operSt, healthy: isComponentHealthy(c.type, c.operSt),
            model: c.model, serial: c.serial, present: true,
            firstSeenAt: now, lastSeenAt: now,
          },
        }),
      ),
    )
  }
  await prisma.hardwareComponent.updateMany({
    where: { apicHostId, present: true, dn: { notIn: uniqueComponents.map(c => c.dn) } },
    data: { present: false },
  })

  // Phase 3: record a status sample.
  const summary = summarizeNodes(uniqueNodes, uniqueComponents)
  await prisma.nodeStatusSample.create({
    data: {
      apicHostId, sampledAt: now,
      nodesTotal: summary.nodesTotal, nodesOnline: summary.nodesOnline,
      componentsTotal: summary.componentsTotal, componentsFailed: summary.componentsFailed,
    },
  })

  await prisma.apicHost.update({
    where: { id: apicHostId },
    data: { lastNodeSyncAt: now },
  })

  return {
    syncedNodes: uniqueNodes.length,
    syncedComponents: uniqueComponents.length,
    nodesOnline: summary.nodesOnline,
  }
}
```

- [ ] **Step 3: Verify**

Run: `bun test src/lib/apic/nodes.test.ts` — existing tests still PASS. Confirm Prisma model references (`prisma.nodeSnapshot`, `prisma.hardwareComponent`, `prisma.nodeStatusSample`, compound key `apicHostId_dn`) resolve. If not, run `bunx prisma generate` and retry. Check no new tsc errors in nodes.ts: `bunx tsc --noEmit 2>&1 | grep "nodes.ts" || echo "no new errors in nodes.ts"`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/apic/nodes.ts
git commit -m "feat: add fetchNodesFromApic and resyncNodes"
```

---

## Task 5: Audit action (union + history label)

**Files:**
- Modify: `src/lib/audit.ts`
- Modify: `src/app/(app)/history/HistoryClient.tsx`

- [ ] **Step 1: Add the action to the union**

In `src/lib/audit.ts`, in the `AuditAction` union, add after `'resync.health'`:

```typescript
  | 'resync.nodes'
```

- [ ] **Step 2: Add the label to the exhaustive map**

In `src/app/(app)/history/HistoryClient.tsx`, the `ACTION_LABELS: Record<AuditAction, string>` map must stay exhaustive. Add after the `'resync.health'` line:

```typescript
  'resync.nodes': 'Resync nodes',
```

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit 2>&1 | grep -i "ACTION_LABELS\|resync.nodes" || echo "no node audit type errors"`
Expected: `no node audit type errors`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit.ts "src/app/(app)/history/HistoryClient.tsx"
git commit -m "feat: add resync.nodes audit action and history label"
```

---

## Task 6: `POST /api/nodes/resync` route

**Files:**
- Create: `src/app/api/nodes/resync/route.ts`

- [ ] **Step 1: Write the route** (mirrors `src/app/api/health-scores/resync/route.ts`):

```typescript
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAudit } from '@/lib/audit'
import { resyncNodes } from '@/lib/apic/nodes'

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

  let result
  try {
    result = await resyncNodes({
      apicHostId,
      host: apicHost.host,
      username: username.trim(),
      password,
    })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch nodes from APIC' },
      { status: 502 },
    )
  }

  await recordAudit({
    userId: session.user.id,
    userName: session.user.username ?? session.user.name,
    action: 'resync.nodes',
    target: `${apicHost.name} (${apicHost.host})`,
    detail: `synced ${result.syncedNodes} nodes, ${result.syncedComponents} components`,
  })

  return Response.json(result)
}
```

- [ ] **Step 2: Verify** — Run: `bun test src/lib/apic` (confirms imports resolve). Confirm no new tsc error in the route file.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/nodes/resync/route.ts
git commit -m "feat: add POST /api/nodes/resync route"
```

---

## Task 7: Cron-resync summary support

**Files:**
- Modify: `src/lib/apic/cron-resync.ts`
- Test: `src/lib/apic/cron-resync.test.ts`

- [ ] **Step 1: Add a failing test**

Append to `src/lib/apic/cron-resync.test.ts` (reuse existing `summarizeResults` / `HostResult` imports — do not duplicate):

```typescript
describe('summarizeResults with nodes dataset', () => {
  it('counts the nodes dataset as a unit', () => {
    const results: HostResult[] = [
      {
        apicHostId: 'h1',
        host: 'apic1',
        endpoints: { synced: 1, total: 1 },
        interfaces: { synced: 2, total: 2 },
        faults: { synced: 3, total: 3 },
        healthScores: { synced: 4, total: 4 },
        nodes: { error: 'boom' },
      },
    ]
    expect(summarizeResults(results)).toBe('partial')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: FAIL (assertion returns 'success' because `nodes` isn't counted, or a type error on the unknown property).

- [ ] **Step 3: Add `nodes` to `HostResult` and the summary loop**

In `src/lib/apic/cron-resync.ts`, add to `HostResult` (next to `healthScores?`):

```typescript
  nodes?: DatasetResult
```

And in `summarizeResults`, extend the dataset loop:

```typescript
    for (const d of [r.endpoints, r.interfaces, r.faults, r.healthScores, r.nodes]) {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/apic/cron-resync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/apic/cron-resync.ts src/lib/apic/cron-resync.test.ts
git commit -m "feat: track nodes dataset in cron resync summary"
```

---

## Task 8: Cron route wiring

**Files:**
- Modify: `src/app/api/cron/resync/route.ts`

- [ ] **Step 1: Import `resyncNodes`**

Add alongside the other resync imports:

```typescript
import { resyncNodes } from '@/lib/apic/nodes'
```

- [ ] **Step 2: Add the Nodes dataset block** after the Health scores block and before `results.push(result)`:

```typescript
    // Nodes & hardware
    let nodes: DatasetResult
    try {
      const r = await resyncNodes({
        apicHostId,
        host: apicHost.host,
        username: trimmedUser,
        password,
      })
      nodes = { synced: r.syncedNodes, total: r.syncedNodes + r.syncedComponents }
    } catch (err) {
      nodes = { error: errorMessage(err, 'Failed to resync nodes') }
    }
    result.nodes = nodes
    await recordAudit({
      userId: null,
      userName: 'scheduler',
      action: 'resync.nodes',
      target: `${apicHost.name} (${apicHost.host})`,
      status: 'error' in nodes ? 'failure' : 'success',
      detail: 'error' in nodes
        ? nodes.error
        : `synced ${nodes.synced} nodes (total ${nodes.total})`,
    })
```

Note: unlike the other datasets, `resyncNodes` returns `{ syncedNodes, syncedComponents, nodesOnline }`, so we build the `DatasetResult` explicitly (`synced` = node count, `total` = nodes + components). Match the existing blocks' indentation and the in-scope `apicHostId`/`apicHost`/`trimmedUser`/`password` variables.

- [ ] **Step 3: Verify** — Run: `bun test src/lib/apic/cron-resync.test.ts`. Confirm no new tsc error in the cron route file.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/resync/route.ts
git commit -m "feat: resync nodes in scheduled cron job"
```

---

## Task 9: Sort helpers

**Files:**
- Create: `src/app/(app)/nodes/sort.ts`
- Test: `src/app/(app)/nodes/sort.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/(app)/nodes/sort.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { sortNodeRows, sortComponentRows } from './sort'

describe('sortNodeRows', () => {
  it('orders by node id in natural numeric order', () => {
    const rows = [{ nodeId: '102' }, { nodeId: '11' }, { nodeId: '2' }]
    expect(sortNodeRows(rows).map(r => r.nodeId)).toEqual(['2', '11', '102'])
  })
})

describe('sortComponentRows', () => {
  it('puts failed components first, then orders by node id', () => {
    const rows = [
      { healthy: true, nodeId: '101', name: '1' },
      { healthy: false, nodeId: '103', name: '1' },
      { healthy: false, nodeId: '101', name: '2' },
    ]
    expect(sortComponentRows(rows).map(r => `${r.nodeId}/${r.healthy}`)).toEqual([
      '101/false', '103/false', '101/true',
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test "src/app/(app)/nodes/sort.test.ts"`
Expected: FAIL — cannot find module `./sort`.

- [ ] **Step 3: Implement the helpers**

Create `src/app/(app)/nodes/sort.ts`:

```typescript
const NATURAL_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

interface SortableNodeRow {
  nodeId: string
}

export function sortNodeRows<T extends SortableNodeRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => NATURAL_COLLATOR.compare(a.nodeId, b.nodeId))
}

interface SortableComponentRow {
  healthy: boolean
  nodeId: string
  name: string
}

export function sortComponentRows<T extends SortableComponentRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.healthy !== b.healthy) return a.healthy ? 1 : -1
    const nodeOrder = NATURAL_COLLATOR.compare(a.nodeId, b.nodeId)
    if (nodeOrder !== 0) return nodeOrder
    return NATURAL_COLLATOR.compare(a.name, b.name)
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test "src/app/(app)/nodes/sort.test.ts"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/nodes/sort.ts" "src/app/(app)/nodes/sort.test.ts"
git commit -m "feat: add node and component sort helpers"
```

---

## Task 10: Nodes page (server) + client

Mirrors the Health Scores page. **Read `src/app/(app)/health-scores/page.tsx` and `HealthScoresClient.tsx` as the template** — copy host-selector, page-size parsing, search/pagination, resync-credential-dialog, headline, and trend-chart scaffolding, then adapt for nodes. The node-specific pieces are below.

**Files:**
- Create: `src/app/(app)/nodes/page.tsx`
- Create: `src/app/(app)/nodes/NodesClient.tsx`

- [ ] **Step 1: Write the server component**

Create `src/app/(app)/nodes/page.tsx`:

```tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getApicHosts } from '@/actions/apic-hosts'
import { NodesClient, type NodeRowProps, type ComponentRowProps } from './NodesClient'
import { sortNodeRows, sortComponentRows } from './sort'

export const metadata: Metadata = {
  title: 'Nodes',
  description: 'Cisco ACI fabric node inventory and PSU/fan hardware health resynced from APIC.',
}

const VALID_PAGE_SIZES = [10, 50, 100, 1000] as const
type PageSizeValue = (typeof VALID_PAGE_SIZES)[number] | 'all'

function parsePageSize(param: string | undefined): PageSizeValue {
  if (param === 'all') return 'all'
  const n = parseInt(param ?? '50', 10)
  return (VALID_PAGE_SIZES as readonly number[]).includes(n) ? (n as PageSizeValue) : 50
}

const VALID_ROLES = ['leaf', 'spine', 'controller'] as const
const VALID_TYPES = ['psu', 'fan'] as const

export default async function NodesPage({
  searchParams,
}: {
  searchParams: Promise<{
    apic?: string
    query?: string
    view?: string
    role?: string
    type?: string
    page?: string
    pageSize?: string
  }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/signin')

  const { apic, query, view: viewParam, role, type, page: pageParam, pageSize: pageSizeParam } =
    await searchParams
  const apicHosts = await getApicHosts()

  const view = viewParam === 'components' ? 'components' : 'nodes'
  const roleFilter = (VALID_ROLES as readonly string[]).includes(role ?? '') ? (role as string) : undefined
  const typeFilter = (VALID_TYPES as readonly string[]).includes(type ?? '') ? (type as string) : undefined
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1)
  const pageSize = parsePageSize(pageSizeParam)

  let nodeRows: NodeRowProps[] = []
  let componentRows: ComponentRowProps[] = []
  let total = 0
  let lastSyncedAt: Date | null = null
  let nodesOnline = 0
  let nodesTotal = 0
  let componentsFailed = 0
  let trend: { sampledAt: string; nodesOnline: number; componentsFailed: number }[] = []

  if (apic && apicHosts.some(h => h.id === apic)) {
    const host = await prisma.apicHost.findUnique({
      where: { id: apic },
      select: { lastNodeSyncAt: true },
    })
    lastSyncedAt = host?.lastNodeSyncAt ?? null

    // Headline counts.
    nodesTotal = await prisma.nodeSnapshot.count({ where: { apicHostId: apic, present: true } })
    nodesOnline = await prisma.nodeSnapshot.count({
      where: { apicHostId: apic, present: true, fabricSt: 'active' },
    })
    componentsFailed = await prisma.hardwareComponent.count({
      where: { apicHostId: apic, present: true, healthy: false },
    })

    if (view === 'components') {
      const where = {
        apicHostId: apic,
        present: true,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(query?.trim()
          ? { OR: [{ name: { contains: query.trim() } }, { nodeId: { contains: query.trim() } }, { dn: { contains: query.trim() } }] }
          : {}),
      }
      total = await prisma.hardwareComponent.count({ where })
      const records = await prisma.hardwareComponent.findMany({
        where,
        ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      })
      componentRows = sortComponentRows(
        records.map(r => ({
          id: r.id, nodeId: r.nodeId, type: r.type, name: r.name,
          operSt: r.operSt, healthy: r.healthy, model: r.model,
        })),
      )
    } else {
      const where = {
        apicHostId: apic,
        present: true,
        ...(roleFilter ? { role: roleFilter } : {}),
        ...(query?.trim()
          ? { OR: [{ name: { contains: query.trim() } }, { nodeId: { contains: query.trim() } }] }
          : {}),
      }
      total = await prisma.nodeSnapshot.count({ where })
      const records = await prisma.nodeSnapshot.findMany({
        where,
        ...(pageSize === 'all' ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      })
      const nodeIds = records.map(r => r.nodeId)
      const compCounts = await prisma.hardwareComponent.groupBy({
        by: ['nodeId', 'type', 'healthy'],
        where: { apicHostId: apic, present: true, nodeId: { in: nodeIds } },
        _count: { _all: true },
      })
      const countFor = (nodeId: string, t: string) => {
        const rows = compCounts.filter(c => c.nodeId === nodeId && c.type === t)
        const totalC = rows.reduce((s, c) => s + c._count._all, 0)
        const okC = rows.filter(c => c.healthy).reduce((s, c) => s + c._count._all, 0)
        return { ok: okC, total: totalC }
      }
      nodeRows = sortNodeRows(
        records.map(r => ({
          id: r.id, nodeId: r.nodeId, name: r.name, role: r.role, model: r.model,
          version: r.version, fabricSt: r.fabricSt, state: r.state, uptime: r.uptime,
          psu: countFor(r.nodeId, 'psu'), fan: countFor(r.nodeId, 'fan'),
        })),
      )
    }

    const samples = await prisma.nodeStatusSample.findMany({
      where: { apicHostId: apic },
      orderBy: { sampledAt: 'desc' },
      take: 100,
      select: { sampledAt: true, nodesOnline: true, componentsFailed: true },
    })
    trend = samples
      .reverse()
      .map(s => ({
        sampledAt: s.sampledAt.toISOString(),
        nodesOnline: s.nodesOnline,
        componentsFailed: s.componentsFailed,
      }))
  }

  return (
    <NodesClient
      apicHosts={apicHosts}
      selectedApic={apic ?? null}
      query={query ?? ''}
      view={view}
      role={roleFilter ?? null}
      type={typeFilter ?? null}
      nodeRows={nodeRows}
      componentRows={componentRows}
      total={total}
      page={page}
      pageSize={pageSize}
      lastSyncedAt={lastSyncedAt ? lastSyncedAt.toISOString() : null}
      nodesOnline={nodesOnline}
      nodesTotal={nodesTotal}
      componentsFailed={componentsFailed}
      trend={trend}
    />
  )
}
```

After writing, VERIFY the props passed to `<NodesClient>` exactly match its props interface (Step 2), and that `getApicHosts` import + host shape match the health-scores page.

- [ ] **Step 2: Write the client component**

Create `src/app/(app)/nodes/NodesClient.tsx` by mirroring `HealthScoresClient.tsx`'s scaffolding, adapted for nodes. It MUST:

1. Be `'use client'`, export named `NodesClient`, `NodeRowProps`, `ComponentRowProps`:

```tsx
export interface NodeRowProps {
  id: string
  nodeId: string
  name: string
  role: string
  model: string
  version: string | null
  fabricSt: string
  state: string | null
  uptime: string | null
  psu: { ok: number; total: number }
  fan: { ok: number; total: number }
}

export interface ComponentRowProps {
  id: string
  nodeId: string
  type: string
  name: string
  operSt: string
  healthy: boolean
  model: string
}
```

2. Accept props matching EXACTLY what `page.tsx` passes: `apicHosts` (same `SafeApicHost[]` from `@/actions/apic-hosts`), `selectedApic: string | null`, `query: string`, `view: 'nodes' | 'components'`, `role: string | null`, `type: string | null`, `nodeRows: NodeRowProps[]`, `componentRows: ComponentRowProps[]`, `total: number`, `page: number`, `pageSize: number | 'all'`, `lastSyncedAt: string | null`, `nodesOnline: number`, `nodesTotal: number`, `componentsFailed: number`, `trend: { sampledAt: string; nodesOnline: number; componentsFailed: number }[]`.

3. Reuse from `HealthScoresClient.tsx` (copy + adapt, same UX/visual conventions): page header, host selector (sets `apic` URL param), search input with the SAME debounced URL-echo handling, page-size selector, pagination, last-synced display, resync credential dialog — except POST to `/api/nodes/resync` then `router.refresh()`. Surface errors inline.

4. **Headline block**: nodes online / total as a large number (e.g. `nodesOnline` / `nodesTotal`; render online in green when `nodesOnline === nodesTotal`, amber/red otherwise using the project's color conventions), plus a failed-component stat (red when `componentsFailed > 0`, else muted). Show "—" appropriately when no host selected.

5. **View toggle** (Nodes / Components) that sets the `view` URL param (`nodes` default, `components`), using the SAME `router.push` URL pattern as the health-scores scope filter. When switching view, reset `page` to 1.

6. **Tables** (render whichever matches `view`):
   - **Nodes table** columns: Node (`nodeId`), Name, Role, Model, Version (`version` else "—"), State (badge from `fabricSt`; show `state` too if present — green when `fabricSt==='active'`, red otherwise), Uptime (`uptime` else "—"), PSU (`{psu.ok}/{psu.total}` — red when `psu.ok < psu.total`, muted "—" when total is 0), Fan (`{fan.ok}/{fan.total}` — same rule).
   - **Components table** columns: Node (`nodeId`), Type (`type`), Name, Status (`operSt` badge — green when `healthy`, red otherwise), Model. Rows arrive failed-first from the server; render in order.
   Use the same `@/components/ui` table primitives as `HealthScoresClient`.

7. **Filter control**: in Nodes view a role filter (All/Leaf/Spine/Controller → `role` URL param); in Components view a type filter (All/PSU/Fan → `type` URL param). Same `router.push` pattern as health-scores.

8. **Trend chart** above the table using the SAME recharts + shadcn approach as `HealthScoresClient` (`ChartContainer`, `ChartConfig`, `LineChart`, `Line`, `ChartTooltip`, `ChartTooltipContent` from `@/components/ui/chart`; raw primitives from `recharts`). TWO lines — `nodesOnline` and `componentsFailed` — over `trend` (x = `sampledAt` friendly date). Hide when `trend.length === 0`:

```tsx
const trendConfig: ChartConfig = {
  nodesOnline: { label: 'Nodes online', color: 'var(--chart-1)' },
  componentsFailed: { label: 'Failed components', color: 'var(--chart-2)' },
}
```

9. Empty states for no host selected / no rows, mirroring `HealthScoresClient`.

- [ ] **Step 3: Verify**
- Run `bun test` — all existing tests still pass (report counts).
- Run `bun run lint` — your two new files must add NO new lint errors beyond the known inherited `react-hooks` URL-echo pattern that also exists in the other client components. Ignore unrelated pre-existing issues.
- If a type/lint issue in your files can't be fully resolved after reasonable effort, report DONE_WITH_CONCERNS with specifics.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/nodes/page.tsx" "src/app/(app)/nodes/NodesClient.tsx"
git commit -m "feat: add nodes page with headline, trend, and node/component views"
```

---

## Task 11: Sidebar navigation entry

**Files:**
- Modify: `src/components/AppSidebar.tsx`

- [ ] **Step 1: Import the icon**

Add `IconServer2` to the `@tabler/icons-react` import block (next to `IconActivityHeartbeat`). `IconServer2` is a verified valid export and is distinct from `IconServer` (already used by Static Ports).

- [ ] **Step 2: Add the nav entry** immediately after the Health Scores entry (`href: "/health-scores"`):

```tsx
      {
        href: "/nodes",
        label: "Nodes",
        icon: <IconServer2 size={15} stroke={1.75} />,
      },
```

- [ ] **Step 3: Verify** — Run: `bunx tsc --noEmit 2>&1 | grep -i "AppSidebar" || echo "no sidebar type errors"`. Expected: `no sidebar type errors`. Also confirm the icon import resolves: `node -e "const i=require('@tabler/icons-react'); console.log(Object.keys(i).includes('IconServer2'))"` prints `true`.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat: add Nodes sidebar navigation entry"
```

---

## Task 12: Dashboard nodes tile

**Files:**
- Create: `src/actions/nodes.ts`
- Create: `src/app/(app)/dashboard/NodesTile.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Write the server action**

Create `src/actions/nodes.ts` (mirrors `src/actions/health-scores.ts` — match its exact auth/session convention):

```typescript
'use server'

import { headers } from 'next/headers'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export interface NodeTileSummary {
  nodesOnline: number
  nodesTotal: number
  componentsFailed: number
}

/** Aggregate node online/total and failed-component counts across all hosts. */
export async function getNodeSummary(): Promise<NodeTileSummary> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { nodesOnline: 0, nodesTotal: 0, componentsFailed: 0 }

  const [nodesTotal, nodesOnline, componentsFailed] = await Promise.all([
    prisma.nodeSnapshot.count({ where: { present: true } }),
    prisma.nodeSnapshot.count({ where: { present: true, fabricSt: 'active' } }),
    prisma.hardwareComponent.count({ where: { present: true, healthy: false } }),
  ])
  return { nodesOnline, nodesTotal, componentsFailed }
}
```

- [ ] **Step 2: Write the tile component**

Create `src/app/(app)/dashboard/NodesTile.tsx`:

```tsx
import Link from 'next/link'
import { IconServer2 } from '@tabler/icons-react'
import { getNodeSummary } from '@/actions/nodes'

export async function NodesTile() {
  const { nodesOnline, nodesTotal, componentsFailed } = await getNodeSummary()
  const allOnline = nodesTotal > 0 && nodesOnline === nodesTotal
  const onlineColor = nodesTotal === 0
    ? 'text-muted-foreground'
    : allOnline
      ? 'text-green-600'
      : 'text-amber-500'

  return (
    <Link
      href="/nodes"
      className="block rounded-2xl border border-border bg-card shadow-sm p-5 hover:border-foreground/20 transition-colors"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-serif text-sm font-semibold text-foreground">Nodes</h3>
        <IconServer2 size={16} stroke={1.75} className="text-muted-foreground" />
      </div>
      <div className="mt-4 flex items-baseline gap-4">
        <span className={`text-2xl font-semibold ${onlineColor}`}>
          {nodesTotal === 0 ? '—' : `${nodesOnline}/${nodesTotal}`}
        </span>
        <span className="text-sm text-subtle">
          <span className={componentsFailed > 0 ? 'text-red-600' : 'text-muted-foreground'}>
            {componentsFailed}
          </span>{' '}
          failed HW
        </span>
      </div>
      <p className="text-xs text-subtle mt-1">nodes online / total</p>
    </Link>
  )
}
```

Match the card styling of `src/app/(app)/dashboard/HealthTile.tsx` — read it; if its card classes differ, align `NodesTile` to them for visual consistency.

- [ ] **Step 3: Add the tile to the dashboard grid**

In `src/app/(app)/dashboard/page.tsx`, add `import { NodesTile } from './NodesTile'` and place `<NodesTile />` immediately after `<HealthTile />` inside the same grid `<div>`. Change nothing else.

- [ ] **Step 4: Verify**
- Run `bun test` — all pass (report counts).
- Run `bun run lint` — the three touched files must add no NEW lint errors.

- [ ] **Step 5: Commit**

```bash
git add src/actions/nodes.ts "src/app/(app)/dashboard/NodesTile.tsx" "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: add nodes summary tile to dashboard"
```

---

## Final verification

- [ ] **Run the full test suite** — Run: `bun test`. Expected: all pass, including new `nodes.test.ts` and `sort.test.ts` and the updated `cron-resync.test.ts`.
- [ ] **Lint** — Run: `bun run lint`. Expected: no new errors beyond the known inherited `react-hooks` URL-echo pattern in the client components.
- [ ] **End-to-end smoke test** — With a reachable APIC: trigger a manual resync from `/nodes`, confirm the headline, trend, and both views (Nodes + Components) populate; confirm `/dashboard` shows the Nodes tile; confirm `/api/cron/resync` includes a `nodes` block in its response.

---

## Self-Review notes (addressed)

- **Spec coverage:** data model incl. stored `healthy` (Task 1), node parse/merge (Task 2), component parse + `isNodeOnline`/`isComponentHealthy`/`summarizeNodes` (Task 3), `fetchNodesFromApic`/`resyncNodes` with dual present-detection + sample (Task 4), audit union **and** history label (Task 5), manual route (Task 6), cron summary + wiring with explicit `DatasetResult` construction (Tasks 7–8), `sortNodeRows`/`sortComponentRows` (Task 9), page with headline + trend + Nodes/Components view toggle + per-node PSU/fan counts (Task 10), sidebar with verified `IconServer2` (Task 11), dashboard tile (Task 12). Read-only, no temperature, no drawer, no thresholds — consistent with the spec's YAGNI list.
- **Type consistency:** `NodeRow`/`ComponentRow`/`TopSystemFields`/`NodeSummary`/`ResyncNodesResult`/`NodeRowProps`/`ComponentRowProps`/`NodeTileSummary` each defined once and reused; parse-helper names consistent across Tasks 2/3/4/10; compound key `apicHostId_dn` matches `@@unique([apicHostId, dn])`; `summarizeNodes` fields (`nodesTotal`/`nodesOnline`/`componentsTotal`/`componentsFailed`) match the `NodeStatusSample` columns; stored `healthy` boolean is set in Task 4 and queried in Tasks 10/12.
- **Cron shape note:** `resyncNodes` returns `{ syncedNodes, syncedComponents, nodesOnline }` (not `{ synced, total }`), so Task 8 builds the `DatasetResult` explicitly — flagged in the spec and the task.
- **Server/client boundary:** the client (Task 10) takes pre-computed counts and PSU/fan `{ok,total}` from the server; it does not import the server-only `@/lib/apic/nodes` module.
