# Inventory Management (Sites, Racks, Devices) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port Sites/Racks/Devices inventory management — including the drag-and-drop rack visualization — from the sibling project `netroku` into `netroku-aci`, following this project's server-action + Zod + shadcn conventions.

**Architecture:** Server actions under `src/actions/inventory/` (`sites.ts`, `racks.ts`, `devices.ts`) backed by the existing Prisma models, each returning aci's `ActionResult<T>` shape and gated by `requireAdmin()` for mutations. A framework-free `canPlaceDevice` collision-check lives in `src/lib/inventory/rack-placement.ts` and is imported by both the client (live drag preview) and the server actions (real validation, wrapped in a `prisma.$transaction`). Two new route trees — `src/app/(app)/inventory/devices/` and `src/app/(app)/inventory/racks/` — host a paginated devices list + detail page and a site-scoped rack-visualization page, the latter a near-verbatim port of netroku's native-HTML5-drag-and-drop `RackVisualization` component adapted from numeric to `cuid` string ids.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 6 (PostgreSQL), Zod 4, react-hook-form + `@hookform/resolvers/zod`, shadcn/ui (Radix), `@tabler/icons-react`, `sonner` for toasts, `bun:test` for unit tests.

## Global Constraints

- Ids for `Site`/`Rack`/`Device`/`DeviceStack` are `cuid()` strings (already the case in `prisma/schema.prisma`) — every port from netroku's numeric-id version must use `string` throughout, never `number`.
- `ActionResult<T> = { success: true; data: T } | { success: false; error: string }` — the aci shape (`success`/`error: string`), **not** netroku's `{ ok, error: ActionError }` shape.
- All inventory mutations (create/update/delete/place/unassign/resize) require `requireAdmin()`; reads require `requireSession()`. No `adminOnly` flag on the sidebar nav items themselves — visibility is universal, mutation controls are hidden/disabled client-side for non-admins and enforced server-side.
- Icons come from `@tabler/icons-react` (not `lucide-react`, which netroku uses and aci does not have installed).
- Server actions in this project are **not** unit-tested (confirmed: zero `.test.ts` files under `src/actions/`). Only pure, framework-free lib functions get `bun:test` coverage. Follow this — don't invent action-level tests.
- `docs/` is gitignored in this repo — this plan file and its spec are intentionally untracked, don't force-add them to git.
- Deviation from netroku, called out explicitly: the `Device` create/edit form does **not** expose `rackId`/`rackPosition` fields (netroku's does). All rack placement goes exclusively through the rack-visualization page's validated actions (`updateDevicePlacement`, `clearDevicePlacement`), so there is no bypass route around the new server-side collision check. New devices are always created unassigned.

---

### Task 1: Fix schema inconsistencies (`@@map` + timestamps) via a new migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `Site.createdAt`, `Site.updatedAt`, `Rack.createdAt`, `Rack.updatedAt`, `Device.createdAt` fields; snake_case table names for `Site`/`Rack`/`DeviceStack`/`Device`. Every later task's Prisma queries assume these fields exist.

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Replace the `Site`, `Rack`, `DeviceStack`, and `Device` models (currently at lines 111–161) with:

```prisma
model Site {
  id        String  @id @default(cuid())
  name      String
  address   String?
  latitude  Float?
  longitude Float?

  racks Rack[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("site")
}

model Rack {
  id      String @id @default(cuid())
  name    String
  heightU Int

  siteId  String
  site    Site     @relation(fields: [siteId], references: [id])
  devices Device[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("rack")
}

model DeviceStack {
  id      String   @id @default(cuid())
  name    String
  devices Device[]

  @@map("device_stack")
}

model Device {
  id           String       @id @default(cuid())
  name         String // Hostname
  serialNumber String       @unique
  assetTag     String?      @unique
  status       DeviceStatus @default(ACTIVE)

  // Location
  rackId       String?
  rack         Rack?   @relation(fields: [rackId], references: [id])
  rackPosition Int? // e.g. 10 (Unit 10)

  // Hardware
  vendor  String
  model   String
  heightU Int

  // Stack
  deviceStackId String?      @map("device_stack_id")
  deviceStack   DeviceStack? @relation(fields: [deviceStackId], references: [id], onDelete: SetNull)
  stackMember   Int?         @map("stack_member")
  stackRole     StackRole?   @map("stack_role")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("device")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd /home/furina/Projects/netroku-aci && npx prisma migrate dev --name inventory_schema_fixes`

Expected: Prisma detects the `@@map` renames and new `createdAt`/`updatedAt` columns, generates SQL (`ALTER TABLE "Site" RENAME TO "site"`, etc. + `ADD COLUMN "createdAt"` with a default), applies it to the dev database, and regenerates the Prisma client. Confirm the command exits 0 and a new folder appears under `prisma/migrations/`.

- [ ] **Step 3: Verify the client picks up the new fields**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "site\|rack\|device" | head -20`

Expected: no new type errors referencing `Site`, `Rack`, or `Device` (the regenerated Prisma client types now include `createdAt`/`updatedAt`).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "fix(schema): map inventory tables to snake_case and add timestamps"
```

---

### Task 2: Shared rack-placement collision logic

**Files:**
- Create: `src/lib/inventory/rack-placement.ts`
- Test: `src/lib/inventory/rack-placement.test.ts`

**Interfaces:**
- Produces: `canPlaceDevice(devices: PlaceableDevice[], deviceId: string, rackPosition: number, heightU: number, rackHeightU: number): boolean` and `type PlaceableDevice = { id: string; rackPosition: number | null; heightU: number }`. Used by Task 6 (device actions, server-side re-validation) and Task 12 (rack visualization client component, live drag preview).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/inventory/rack-placement.test.ts
import { describe, expect, it } from 'bun:test'
import { canPlaceDevice, type PlaceableDevice } from './rack-placement'

describe('canPlaceDevice', () => {
  it('allows placement in an empty rack within bounds', () => {
    expect(canPlaceDevice([], 'dev-1', 1, 2, 42)).toBe(true)
  })

  it('rejects placement below unit 1', () => {
    const devices: PlaceableDevice[] = []
    expect(canPlaceDevice(devices, 'dev-1', 0, 1, 42)).toBe(false)
  })

  it('rejects placement extending past the top of the rack', () => {
    const devices: PlaceableDevice[] = []
    expect(canPlaceDevice(devices, 'dev-1', 42, 2, 42)).toBe(false)
  })

  it('allows a device to exactly fill the rack', () => {
    expect(canPlaceDevice([], 'dev-1', 1, 42, 42)).toBe(true)
  })

  it('rejects overlap with another device', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 10, heightU: 2 }, // occupies U10-U11
    ]
    expect(canPlaceDevice(devices, 'dev-1', 11, 1, 42)).toBe(false)
    expect(canPlaceDevice(devices, 'dev-1', 9, 2, 42)).toBe(false) // occupies U9-U10, overlaps at U10
  })

  it('allows adjacent (non-overlapping) placement', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 10, heightU: 2 }, // occupies U10-U11
    ]
    expect(canPlaceDevice(devices, 'dev-1', 12, 1, 42)).toBe(true)
    expect(canPlaceDevice(devices, 'dev-1', 8, 2, 42)).toBe(true) // occupies U8-U9
  })

  it('excludes the device being moved from its own collision check', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-1', rackPosition: 10, heightU: 2 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 10, 2, 42)).toBe(true)
  })

  it('ignores unassigned devices (null rackPosition) in the same list', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: null, heightU: 4 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 1, 4, 42)).toBe(true)
  })

  it('treats zero/negative heightU on an existing device as at least 1U for overlap purposes', () => {
    const devices: PlaceableDevice[] = [
      { id: 'dev-2', rackPosition: 5, heightU: 0 },
    ]
    expect(canPlaceDevice(devices, 'dev-1', 5, 1, 42)).toBe(false)
    expect(canPlaceDevice(devices, 'dev-1', 6, 1, 42)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/furina/Projects/netroku-aci && bun test src/lib/inventory/rack-placement.test.ts`
Expected: FAIL — `Cannot find module './rack-placement'`.

- [ ] **Step 3: Implement `canPlaceDevice`**

```typescript
// src/lib/inventory/rack-placement.ts
export type PlaceableDevice = {
  id: string
  rackPosition: number | null
  heightU: number
}

export function canPlaceDevice(
  devices: PlaceableDevice[],
  deviceId: string,
  rackPosition: number,
  heightU: number,
  rackHeightU: number,
): boolean {
  const start = rackPosition
  const end = rackPosition + heightU - 1

  if (start < 1 || end > rackHeightU) return false

  return !devices.some((device) => {
    if (device.id === deviceId || device.rackPosition === null) return false
    const otherStart = device.rackPosition
    const otherEnd = device.rackPosition + Math.max(1, device.heightU) - 1
    return start <= otherEnd && end >= otherStart
  })
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/furina/Projects/netroku-aci && bun test src/lib/inventory/rack-placement.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/rack-placement.ts src/lib/inventory/rack-placement.test.ts
git commit -m "feat(inventory): add rack placement collision logic"
```

---

### Task 3: Extend `AuditAction` for inventory events

**Files:**
- Modify: `src/lib/audit.ts:4-23`

**Interfaces:**
- Produces: 12 new `AuditAction` string literals consumed by Tasks 4–6.

- [ ] **Step 1: Add the new literals to the union**

In `src/lib/audit.ts`, change:

```typescript
export type AuditAction =
  | 'apic_host.create'
  | 'apic_host.update'
  | 'apic_host.delete'
  | 'deploy'
  | 'rollback'
  | 'resync.endpoints'
  | 'resync.interfaces'
  | 'resync.faults'
  | 'resync.health'
  | 'resync.nodes'
  | 'resync.epgs'
  | 'ingest.legacy.health'
  | 'ingest.legacy.interfaces'
  | 'ingest.legacy.endpoints'
  | 'user.create'
  | 'user.delete'
  | 'resync.schedule.run'
  | 'resync.schedule.update'
  | 'resync.schedule.delete'
```

to:

```typescript
export type AuditAction =
  | 'apic_host.create'
  | 'apic_host.update'
  | 'apic_host.delete'
  | 'deploy'
  | 'rollback'
  | 'resync.endpoints'
  | 'resync.interfaces'
  | 'resync.faults'
  | 'resync.health'
  | 'resync.nodes'
  | 'resync.epgs'
  | 'ingest.legacy.health'
  | 'ingest.legacy.interfaces'
  | 'ingest.legacy.endpoints'
  | 'user.create'
  | 'user.delete'
  | 'resync.schedule.run'
  | 'resync.schedule.update'
  | 'resync.schedule.delete'
  | 'site.create'
  | 'site.update'
  | 'site.delete'
  | 'rack.create'
  | 'rack.update'
  | 'rack.delete'
  | 'device.create'
  | 'device.update'
  | 'device.delete'
  | 'device.place'
  | 'device.unassign'
  | 'device.resize'
```

- [ ] **Step 2: Add labels to the history filter map so the History page recognizes the new actions**

In `src/lib/history/query.ts`, add to `HISTORY_ACTION_LABELS` (after `'resync.schedule.delete': 'Resync schedule updated',` — actually after the `'resync.schedule.delete'` entry):

```typescript
  'site.create': 'Site added',
  'site.update': 'Site updated',
  'site.delete': 'Site deleted',
  'rack.create': 'Rack added',
  'rack.update': 'Rack updated',
  'rack.delete': 'Rack deleted',
  'device.create': 'Device added',
  'device.update': 'Device updated',
  'device.delete': 'Device deleted',
  'device.place': 'Device placed in rack',
  'device.unassign': 'Device removed from rack',
  'device.resize': 'Device resized',
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i audit`
Expected: no errors (the `HISTORY_ACTION_LABELS` type is `Record<AuditAction, string>`, so a missing entry would fail to compile — this confirms all 12 new actions were added).

- [ ] **Step 4: Commit**

```bash
git add src/lib/audit.ts src/lib/history/query.ts
git commit -m "feat(audit): add inventory action types and history labels"
```

---

### Task 4: Site schema + server actions

**Files:**
- Create: `src/lib/schemas/site.ts`
- Create: `src/actions/inventory/sites.ts`

**Interfaces:**
- Consumes: `prisma` (`src/lib/prisma.ts`), `getSession` (`src/lib/auth.ts`), `recordAudit` (`src/lib/audit.ts`).
- Produces: `type SafeSite = { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null; createdAt: Date; updatedAt: Date }`, `getSites(): Promise<SafeSite[]>`, `createSite(data: SiteFormValues): Promise<ActionResult<SafeSite>>`, `updateSite(id: string, data: SiteUpdateFormValues): Promise<ActionResult<SafeSite>>`, `deleteSite(id: string): Promise<ActionResult<void>>`. Consumed by Task 8 (`SiteForm`) and Task 13 (`RacksClient`).

- [ ] **Step 1: Write the schema**

```typescript
// src/lib/schemas/site.ts
import { z } from 'zod'

export const siteSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128, 'Name must be 128 characters or fewer'),
  address: z.string().max(256, 'Address must be 256 characters or fewer').optional().nullable(),
  latitude: z.number().min(-90, 'Latitude must be between -90 and 90').max(90, 'Latitude must be between -90 and 90').optional().nullable(),
  longitude: z.number().min(-180, 'Longitude must be between -180 and 180').max(180, 'Longitude must be between -180 and 180').optional().nullable(),
})

export const siteUpdateSchema = siteSchema

export type SiteFormValues = z.infer<typeof siteSchema>
export type SiteUpdateFormValues = z.infer<typeof siteUpdateSchema>
```

- [ ] **Step 2: Write the server actions**

```typescript
// src/actions/inventory/sites.ts
'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  siteSchema,
  siteUpdateSchema,
  type SiteFormValues,
  type SiteUpdateFormValues,
} from '@/lib/schemas/site'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeSite = {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
}

async function requireSession(): Promise<{ id: string; role: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return {
    id: session.user.id,
    role: session.user.role ?? 'member',
    userName: session.user.username ?? session.user.name,
  }
}

async function requireAdmin(): Promise<{ id: string; role: string; userName: string }> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

function toSafe(site: {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
  updatedAt: Date
}): SafeSite {
  return {
    id: site.id,
    name: site.name,
    address: site.address,
    latitude: site.latitude,
    longitude: site.longitude,
    createdAt: site.createdAt,
    updatedAt: site.updatedAt,
  }
}

export async function getSites(): Promise<SafeSite[]> {
  await requireSession()
  const sites = await prisma.site.findMany({ orderBy: { name: 'asc' } })
  return sites.map(toSafe)
}

export async function createSite(data: SiteFormValues): Promise<ActionResult<SafeSite>> {
  try {
    const actor = await requireAdmin()
    const parsed = siteSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const site = await prisma.site.create({
      data: {
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.create',
      target: site.name,
    })
    return { success: true, data: toSafe(site) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateSite(
  id: string,
  data: SiteUpdateFormValues,
): Promise<ActionResult<SafeSite>> {
  try {
    const actor = await requireAdmin()
    const parsed = siteUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.site.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        address: parsed.data.address ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
      },
    })
    if (result.count === 0) return { success: false, error: 'Site not found' }
    const site = await prisma.site.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.update',
      target: site.name,
    })
    return { success: true, data: toSafe(site) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteSite(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.site.findUnique({ where: { id } })
    const result = await prisma.site.deleteMany({ where: { id } }).catch((err) => {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2003') {
        throw new Error('Cannot delete a site that still has racks')
      }
      throw err
    })
    if (result.count === 0) return { success: false, error: 'Site not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'site.delete',
      target: existing?.name ?? id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "sites\|site.ts"`
Expected: no output (no errors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/site.ts src/actions/inventory/sites.ts
git commit -m "feat(inventory): add site server actions"
```

---

### Task 5: Device list-query helpers (pure, tested)

**Files:**
- Create: `src/lib/inventory/device-query.ts`
- Test: `src/lib/inventory/device-query.test.ts`

**Interfaces:**
- Produces: `DEVICE_PAGE_SIZE = 20`, `type DeviceListParams = { query: string; page: number }`, `parseDeviceListParams(input: { q?: string; page?: string }): DeviceListParams`, `buildDeviceWhere(params: DeviceListParams): Prisma.DeviceWhereInput`, `clampDevicePage(page: number, total: number): number`, `deviceListWindow(page: number, total: number): { page: number; skip: number; take: number }`, `buildDeviceListUrl(params: DeviceListParams): string`. Consumed by Task 6 (`getDevices` action) and Task 10 (devices page).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/inventory/device-query.test.ts
import { describe, expect, it } from 'bun:test'
import {
  buildDeviceListUrl,
  buildDeviceWhere,
  clampDevicePage,
  deviceListWindow,
  parseDeviceListParams,
} from './device-query'

describe('parseDeviceListParams', () => {
  it('trims the query and accepts a positive page', () => {
    expect(parseDeviceListParams({ q: '  sw01  ', page: '3' })).toEqual({
      query: 'sw01',
      page: 3,
    })
  })

  it('falls back to page 1 for missing or invalid page', () => {
    expect(parseDeviceListParams({})).toEqual({ query: '', page: 1 })
    expect(parseDeviceListParams({ page: '-2' })).toEqual({ query: '', page: 1 })
  })
})

describe('buildDeviceWhere', () => {
  it('returns an empty where clause for no query', () => {
    expect(buildDeviceWhere({ query: '', page: 1 })).toEqual({})
  })

  it('builds an OR clause across searchable fields for a query', () => {
    const where = buildDeviceWhere({ query: 'core', page: 1 })
    expect(where.OR).toBeDefined()
    expect(where.OR).toHaveLength(7)
  })
})

describe('clampDevicePage / deviceListWindow', () => {
  it('clamps to the last page when requesting beyond the end', () => {
    expect(clampDevicePage(99, 25)).toBe(2) // 25 items / 20 per page = 2 pages
  })

  it('clamps to page 1 when there are no results', () => {
    expect(clampDevicePage(5, 0)).toBe(1)
  })

  it('computes skip/take for a mid-range page', () => {
    expect(deviceListWindow(2, 45)).toEqual({ page: 2, skip: 20, take: 20 })
  })
})

describe('buildDeviceListUrl', () => {
  it('omits defaults and preserves an active query while paging', () => {
    expect(buildDeviceListUrl({ query: '', page: 1 })).toBe('/inventory/devices')
    expect(buildDeviceListUrl({ query: '  sw01  ', page: 3 })).toBe(
      '/inventory/devices?q=sw01&page=3',
    )
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/furina/Projects/netroku-aci && bun test src/lib/inventory/device-query.test.ts`
Expected: FAIL — `Cannot find module './device-query'`.

- [ ] **Step 3: Implement the helpers**

```typescript
// src/lib/inventory/device-query.ts
import type { Prisma } from '@prisma/client'

export const DEVICE_PAGE_SIZE = 20

export type DeviceListParams = {
  query: string
  page: number
}

export function parseDeviceListParams(input: { q?: string; page?: string }): DeviceListParams {
  const parsedPage = Number.parseInt(input.page ?? '1', 10)
  return {
    query: input.q?.trim() ?? '',
    page: Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  }
}

export function buildDeviceWhere(params: DeviceListParams): Prisma.DeviceWhereInput {
  if (!params.query) return {}
  return {
    OR: [
      { name: { contains: params.query, mode: 'insensitive' } },
      { serialNumber: { contains: params.query, mode: 'insensitive' } },
      { assetTag: { contains: params.query, mode: 'insensitive' } },
      { vendor: { contains: params.query, mode: 'insensitive' } },
      { model: { contains: params.query, mode: 'insensitive' } },
      { rack: { name: { contains: params.query, mode: 'insensitive' } } },
      { rack: { site: { name: { contains: params.query, mode: 'insensitive' } } } },
    ],
  }
}

export function clampDevicePage(page: number, total: number): number {
  const totalPages = Math.max(1, Math.ceil(total / DEVICE_PAGE_SIZE))
  return Math.min(Math.max(1, page), totalPages)
}

export function deviceListWindow(page: number, total: number) {
  const effectivePage = clampDevicePage(page, total)
  return {
    page: effectivePage,
    skip: (effectivePage - 1) * DEVICE_PAGE_SIZE,
    take: DEVICE_PAGE_SIZE,
  }
}

export function buildDeviceListUrl(params: DeviceListParams): string {
  const search = new URLSearchParams()
  if (params.query.trim()) search.set('q', params.query.trim())
  if (params.page > 1) search.set('page', String(params.page))
  const queryString = search.toString()
  return `/inventory/devices${queryString ? `?${queryString}` : ''}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd /home/furina/Projects/netroku-aci && bun test src/lib/inventory/device-query.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inventory/device-query.ts src/lib/inventory/device-query.test.ts
git commit -m "feat(inventory): add device list pagination/search helpers"
```

---

### Task 6: Device schema + server actions (incl. hardened placement/resize)

**Files:**
- Create: `src/lib/schemas/device.ts`
- Create: `src/actions/inventory/devices.ts`

**Interfaces:**
- Consumes: `canPlaceDevice`, `type PlaceableDevice` (Task 2), `DEVICE_PAGE_SIZE`, `buildDeviceWhere`, `deviceListWindow`, `type DeviceListParams` (Task 5), `prisma`, `getSession`, `recordAudit`.
- Produces: `type SafeDevice`, `type SafeDeviceWithRack`, `type DeviceCatalogEntry`, `type DeviceListPage = { devices: SafeDeviceWithRack[]; total: number; page: number }`, `getDevices(params: DeviceListParams): Promise<DeviceListPage>`, `getDeviceById(id: string): Promise<SafeDeviceWithRack | null>`, `getAllDevices(): Promise<DeviceCatalogEntry[]>`, `createDevice`, `updateDevice`, `deleteDevice`, `updateDevicePlacement(deviceId: string, rackId: string, rackPosition: number): Promise<ActionResult<SafeDevice>>`, `clearDevicePlacement(deviceId: string): Promise<ActionResult<SafeDevice>>`, `updateDeviceHeight(deviceId: string, heightU: number): Promise<ActionResult<SafeDevice>>`. Consumed by Task 8 (`DeviceForm`), Task 10 (devices list), Task 11 (device detail), Task 12/13 (rack visualization).

- [ ] **Step 1: Write the schema**

Device create/update deliberately excludes `rackId`/`rackPosition` — see Global Constraints.

```typescript
// src/lib/schemas/device.ts
import { z } from 'zod'
import { DeviceStatus } from '@prisma/client'

export const deviceSchema = z.object({
  name: z.string().min(1, 'Hostname is required').max(128, 'Hostname must be 128 characters or fewer'),
  serialNumber: z.string().min(1, 'Serial number is required').max(128, 'Serial number must be 128 characters or fewer'),
  assetTag: z.string().max(128, 'Asset tag must be 128 characters or fewer').optional().nullable(),
  status: z.enum(DeviceStatus).default(DeviceStatus.ACTIVE),
  vendor: z.string().min(1, 'Vendor is required').max(128, 'Vendor must be 128 characters or fewer'),
  model: z.string().min(1, 'Model is required').max(128, 'Model must be 128 characters or fewer'),
  heightU: z.number().int('Height must be a whole number').positive('Height must be a positive integer').max(60, 'Height must be 60U or fewer'),
})

export const deviceUpdateSchema = deviceSchema

export type DeviceFormValues = z.input<typeof deviceSchema>
export type DeviceUpdateFormValues = z.input<typeof deviceUpdateSchema>
```

- [ ] **Step 2: Write the server actions**

```typescript
// src/actions/inventory/devices.ts
'use server'

import { z } from 'zod'
import type { DeviceStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import { canPlaceDevice } from '@/lib/inventory/rack-placement'
import {
  buildDeviceWhere,
  deviceListWindow,
  type DeviceListParams,
} from '@/lib/inventory/device-query'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeDevice = {
  id: string
  name: string
  serialNumber: string
  assetTag: string | null
  status: DeviceStatus
  rackId: string | null
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
  createdAt: Date
  updatedAt: Date
}

export type SafeDeviceWithRack = SafeDevice & {
  rack: { id: string; name: string; site: { id: string; name: string } } | null
}

export type DeviceCatalogEntry = {
  id: string
  name: string
  serialNumber: string
  rackId: string | null
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
}

export type DeviceListPage = {
  devices: SafeDeviceWithRack[]
  total: number
  page: number
}

async function requireSession(): Promise<{ id: string; role: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return {
    id: session.user.id,
    role: session.user.role ?? 'member',
    userName: session.user.username ?? session.user.name,
  }
}

async function requireAdmin(): Promise<{ id: string; role: string; userName: string }> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

type RawDevice = {
  id: string
  name: string
  serialNumber: string
  assetTag: string | null
  status: DeviceStatus
  rackId: string | null
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
  createdAt: Date
  updatedAt: Date
}

function toSafe(device: RawDevice): SafeDevice {
  return {
    id: device.id,
    name: device.name,
    serialNumber: device.serialNumber,
    assetTag: device.assetTag,
    status: device.status,
    rackId: device.rackId,
    rackPosition: device.rackPosition,
    vendor: device.vendor,
    model: device.model,
    heightU: device.heightU,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  }
}

function toSafeWithRack(
  device: RawDevice & { rack: { id: string; name: string; site: { id: string; name: string } } | null },
): SafeDeviceWithRack {
  return { ...toSafe(device), rack: device.rack }
}

export async function getDevices(params: DeviceListParams): Promise<DeviceListPage> {
  await requireSession()
  const where = buildDeviceWhere(params)
  const total = await prisma.device.count({ where })
  const window = deviceListWindow(params.page, total)
  const devices = await prisma.device.findMany({
    where,
    orderBy: { name: 'asc' },
    skip: window.skip,
    take: window.take,
    include: { rack: { include: { site: true } } },
  })
  return { devices: devices.map(toSafeWithRack), total, page: window.page }
}

export async function getDeviceById(id: string): Promise<SafeDeviceWithRack | null> {
  await requireSession()
  const device = await prisma.device.findUnique({
    where: { id },
    include: { rack: { include: { site: true } } },
  })
  return device ? toSafeWithRack(device) : null
}

export async function getAllDevices(): Promise<DeviceCatalogEntry[]> {
  await requireSession()
  return prisma.device.findMany({
    select: {
      id: true,
      name: true,
      serialNumber: true,
      rackId: true,
      rackPosition: true,
      vendor: true,
      model: true,
      heightU: true,
    },
    orderBy: { name: 'asc' },
  })
}

export async function createDevice(data: DeviceFormValues): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const device = await prisma.device.create({
      data: {
        name: parsed.data.name,
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        status: parsed.data.status,
        vendor: parsed.data.vendor,
        model: parsed.data.model,
        heightU: parsed.data.heightU,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.create',
      target: `${device.name} (${device.serialNumber})`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevice(
  id: string,
  data: DeviceUpdateFormValues,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsed = deviceUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.device.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        serialNumber: parsed.data.serialNumber,
        assetTag: parsed.data.assetTag ?? null,
        status: parsed.data.status,
        vendor: parsed.data.vendor,
        model: parsed.data.model,
        heightU: parsed.data.heightU,
      },
    })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    const device = await prisma.device.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.update',
      target: `${device.name} (${device.serialNumber})`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteDevice(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.device.findUnique({ where: { id } })
    const result = await prisma.device.deleteMany({ where: { id } })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.delete',
      target: existing ? `${existing.name} (${existing.serialNumber})` : id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDevicePlacement(
  deviceId: string,
  rackId: string,
  rackPosition: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()

    const device = await prisma.$transaction(async (tx) => {
      const [rack, movingDevice, siblings] = await Promise.all([
        tx.rack.findUnique({ where: { id: rackId }, select: { heightU: true } }),
        tx.device.findUnique({ where: { id: deviceId }, select: { heightU: true } }),
        tx.device.findMany({
          where: { rackId },
          select: { id: true, rackPosition: true, heightU: true },
        }),
      ])
      if (!rack) throw new Error('Rack not found')
      if (!movingDevice) throw new Error('Device not found')

      if (!canPlaceDevice(siblings, deviceId, rackPosition, movingDevice.heightU, rack.heightU)) {
        throw new Error('Cannot place device here due to rack collision')
      }

      return tx.device.update({
        where: { id: deviceId },
        data: { rackId, rackPosition },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.place',
      target: `${device.name} → rack ${rackId} U${rackPosition}`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function clearDevicePlacement(deviceId: string): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const result = await prisma.device.updateMany({
      where: { id: deviceId },
      data: { rackId: null, rackPosition: null },
    })
    if (result.count === 0) return { success: false, error: 'Device not found' }
    const device = await prisma.device.findUniqueOrThrow({ where: { id: deviceId } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.unassign',
      target: device.name,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateDeviceHeight(
  deviceId: string,
  heightU: number,
): Promise<ActionResult<SafeDevice>> {
  try {
    const actor = await requireAdmin()
    const parsedHeight = z.number().int().positive().safeParse(heightU)
    if (!parsedHeight.success) return { success: false, error: 'Invalid height' }

    const device = await prisma.$transaction(async (tx) => {
      const movingDevice = await tx.device.findUnique({
        where: { id: deviceId },
        select: { rackId: true, rackPosition: true },
      })
      if (!movingDevice) throw new Error('Device not found')

      if (movingDevice.rackId && movingDevice.rackPosition !== null) {
        const [rack, siblings] = await Promise.all([
          tx.rack.findUnique({ where: { id: movingDevice.rackId }, select: { heightU: true } }),
          tx.device.findMany({
            where: { rackId: movingDevice.rackId },
            select: { id: true, rackPosition: true, heightU: true },
          }),
        ])
        if (!rack) throw new Error('Rack not found')
        if (
          !canPlaceDevice(
            siblings,
            deviceId,
            movingDevice.rackPosition,
            parsedHeight.data,
            rack.heightU,
          )
        ) {
          throw new Error('Cannot resize: not enough free U space')
        }
      }

      return tx.device.update({
        where: { id: deviceId },
        data: { heightU: parsedHeight.data },
      })
    })

    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'device.resize',
      target: `${device.name} → ${device.heightU}U`,
    })
    return { success: true, data: toSafe(device) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "devices.ts\|inventory/devices"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/device.ts src/actions/inventory/devices.ts
git commit -m "feat(inventory): add device server actions with server-side placement validation"
```

---

### Task 7: Rack schema + server actions

**Files:**
- Create: `src/lib/schemas/rack.ts`
- Create: `src/actions/inventory/racks.ts`

**Interfaces:**
- Consumes: `prisma`, `getSession`, `recordAudit`.
- Produces: `type SafeRack`, `type SafeRackDevice`, `type SafeRackWithDevices`, `type RackDropdownOption`, `getRacksBySite(siteId: string): Promise<SafeRackWithDevices[]>`, `getAllRacksForDropdown(): Promise<RackDropdownOption[]>`, `createRack`, `updateRack`, `deleteRack`. Consumed by Task 8 (`RackForm`) and Task 13 (`RacksClient`).

- [ ] **Step 1: Write the schema**

```typescript
// src/lib/schemas/rack.ts
import { z } from 'zod'

export const rackSchema = z.object({
  name: z.string().min(1, 'Name is required').max(128, 'Name must be 128 characters or fewer'),
  heightU: z.number().int('Height must be a whole number').positive('Height must be a positive integer').max(60, 'Height must be 60U or fewer'),
  siteId: z.string().min(1, 'Site is required'),
})

export const rackUpdateSchema = rackSchema

export type RackFormValues = z.infer<typeof rackSchema>
export type RackUpdateFormValues = z.infer<typeof rackUpdateSchema>
```

- [ ] **Step 2: Write the server actions**

```typescript
// src/actions/inventory/racks.ts
'use server'

import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  rackSchema,
  rackUpdateSchema,
  type RackFormValues,
  type RackUpdateFormValues,
} from '@/lib/schemas/rack'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export type SafeRack = {
  id: string
  name: string
  heightU: number
  siteId: string
  createdAt: Date
  updatedAt: Date
}

export type SafeRackDevice = {
  id: string
  name: string
  serialNumber: string
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
}

export type SafeRackWithDevices = SafeRack & { devices: SafeRackDevice[] }

export type RackDropdownOption = { id: string; name: string; site: { name: string } }

async function requireSession(): Promise<{ id: string; role: string; userName: string }> {
  const session = await getSession()
  if (!session) throw new Error('Unauthorized')
  return {
    id: session.user.id,
    role: session.user.role ?? 'member',
    userName: session.user.username ?? session.user.name,
  }
}

async function requireAdmin(): Promise<{ id: string; role: string; userName: string }> {
  const user = await requireSession()
  if (user.role !== 'admin') throw new Error('Forbidden')
  return user
}

function toSafe(rack: {
  id: string
  name: string
  heightU: number
  siteId: string
  createdAt: Date
  updatedAt: Date
}): SafeRack {
  return {
    id: rack.id,
    name: rack.name,
    heightU: rack.heightU,
    siteId: rack.siteId,
    createdAt: rack.createdAt,
    updatedAt: rack.updatedAt,
  }
}

export async function getRacksBySite(siteId: string): Promise<SafeRackWithDevices[]> {
  await requireSession()
  const racks = await prisma.rack.findMany({
    where: { siteId },
    orderBy: { name: 'asc' },
    include: { devices: { orderBy: { name: 'asc' } } },
  })
  return racks.map((rack) => ({
    ...toSafe(rack),
    devices: rack.devices.map((device) => ({
      id: device.id,
      name: device.name,
      serialNumber: device.serialNumber,
      rackPosition: device.rackPosition,
      vendor: device.vendor,
      model: device.model,
      heightU: device.heightU,
    })),
  }))
}

export async function getAllRacksForDropdown(): Promise<RackDropdownOption[]> {
  await requireSession()
  return prisma.rack.findMany({
    select: { id: true, name: true, site: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createRack(data: RackFormValues): Promise<ActionResult<SafeRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = rackSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const rack = await prisma.rack.create({
      data: {
        name: parsed.data.name,
        heightU: parsed.data.heightU,
        siteId: parsed.data.siteId,
      },
    })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.create',
      target: rack.name,
    })
    return { success: true, data: toSafe(rack) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateRack(
  id: string,
  data: RackUpdateFormValues,
): Promise<ActionResult<SafeRack>> {
  try {
    const actor = await requireAdmin()
    const parsed = rackUpdateSchema.safeParse(data)
    if (!parsed.success) return { success: false, error: 'Invalid data' }
    const result = await prisma.rack.updateMany({
      where: { id },
      data: {
        name: parsed.data.name,
        heightU: parsed.data.heightU,
        siteId: parsed.data.siteId,
      },
    })
    if (result.count === 0) return { success: false, error: 'Rack not found' }
    const rack = await prisma.rack.findUniqueOrThrow({ where: { id } })
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.update',
      target: rack.name,
    })
    return { success: true, data: toSafe(rack) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteRack(id: string): Promise<ActionResult<void>> {
  try {
    const actor = await requireAdmin()
    const existing = await prisma.rack.findUnique({ where: { id } })
    const result = await prisma.rack.deleteMany({ where: { id } })
    if (result.count === 0) return { success: false, error: 'Rack not found' }
    await recordAudit({
      userId: actor.id,
      userName: actor.userName,
      action: 'rack.delete',
      target: existing?.name ?? id,
    })
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
```

Note: deleting a rack does not need the P2003 friendly-error handling `deleteSite` has — `Device.rack` is `onDelete: SetNull`, so deleting a rack with devices just unassigns them, it never fails with a foreign-key error.

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "racks.ts\|inventory/racks"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas/rack.ts src/actions/inventory/racks.ts
git commit -m "feat(inventory): add rack server actions"
```

---

### Task 8: Site/Rack/Device forms + shared dialog footer buttons

**Files:**
- Create: `src/components/inventory/dialog-footer-buttons.tsx`
- Create: `src/components/inventory/SiteForm.tsx`
- Create: `src/components/inventory/RackForm.tsx`
- Create: `src/components/inventory/DeviceForm.tsx`

**Interfaces:**
- Consumes: `SiteFormValues` (Task 4), `RackFormValues`, `RackDropdownOption`-shaped `{id, name}[]` sites list (Task 7), `DeviceFormValues` (Task 6), `INPUT_OVERRIDE_CLS` (`src/lib/ui-classes.ts`).
- Produces: `FooterCancel`, `FooterSubmit` components; `SiteForm`, `RackForm`, `DeviceForm` components, each taking `{ form, onSubmit, formId, ... }` and rendering a `<form id={formId}>` whose submit button lives in the caller's dialog footer (matches `ApicHostForm`). Consumed by Task 10 (`DevicesClient`) and Task 13 (`RacksClient`).

- [ ] **Step 1: Shared footer buttons**

```tsx
// src/components/inventory/dialog-footer-buttons.tsx
export function FooterCancel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
    >
      Cancel
    </button>
  )
}

export function FooterSubmit({
  form,
  onClick,
  disabled,
  label,
}: {
  form?: string
  onClick?: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type={form ? 'submit' : 'button'}
      form={form}
      onClick={onClick}
      disabled={disabled}
      className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: `SiteForm`**

```tsx
// src/components/inventory/SiteForm.tsx
'use client'

import { useForm } from 'react-hook-form'
import type { SiteFormValues } from '@/lib/schemas/site'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

export function SiteForm({
  form,
  onSubmit,
  formId,
}: {
  form: ReturnType<typeof useForm<SiteFormValues>>
  onSubmit: (data: SiteFormValues) => void
  formId: string
}) {
  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Name</FormLabel>
              <FormControl>
                <Input autoFocus className={INPUT_OVERRIDE_CLS} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Address</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="latitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Latitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="longitude"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Longitude</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="any"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : Number(e.target.value))
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
```

- [ ] **Step 3: `RackForm`**

```tsx
// src/components/inventory/RackForm.tsx
'use client'

import { useForm } from 'react-hook-form'
import type { RackFormValues } from '@/lib/schemas/rack'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

type SiteOption = { id: string; name: string }

export function RackForm({
  form,
  onSubmit,
  formId,
  sites,
}: {
  form: ReturnType<typeof useForm<RackFormValues>>
  onSubmit: (data: RackFormValues) => void
  formId: string
  sites: SiteOption[]
}) {
  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Name</FormLabel>
              <FormControl>
                <Input autoFocus className={INPUT_OVERRIDE_CLS} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="heightU"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Height (U)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="siteId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Site</FormLabel>
              <FormControl>
                <NativeSelect
                  className="w-full"
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  <NativeSelectOption value="">Select a site</NativeSelectOption>
                  {sites.map((site) => (
                    <NativeSelectOption key={site.id} value={site.id}>
                      {site.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
```

- [ ] **Step 4: `DeviceForm`**

```tsx
// src/components/inventory/DeviceForm.tsx
'use client'

import { useForm } from 'react-hook-form'
import { DeviceStatus } from '@prisma/client'
import type { DeviceFormValues } from '@/lib/schemas/device'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

export function DeviceForm({
  form,
  onSubmit,
  formId,
}: {
  form: ReturnType<typeof useForm<DeviceFormValues>>
  onSubmit: (data: DeviceFormValues) => void
  formId: string
}) {
  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Hostname</FormLabel>
              <FormControl>
                <Input autoFocus className={INPUT_OVERRIDE_CLS} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="serialNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Serial Number</FormLabel>
              <FormControl>
                <Input className={`${INPUT_OVERRIDE_CLS} font-mono`} {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="assetTag"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Asset Tag</FormLabel>
              <FormControl>
                <Input
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  value={field.value ?? ''}
                  onChange={(e) =>
                    field.onChange(e.target.value === '' ? null : e.target.value)
                  }
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Status</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.values(DeviceStatus).map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="vendor"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Vendor</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} placeholder="e.g. Cisco" {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="model"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Model</FormLabel>
              <FormControl>
                <Input className={INPUT_OVERRIDE_CLS} placeholder="e.g. Catalyst 9300" {...field} />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="heightU"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-foreground">Height (U)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  className={INPUT_OVERRIDE_CLS}
                  {...field}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}
```

- [ ] **Step 5: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "components/inventory"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/components/inventory/dialog-footer-buttons.tsx src/components/inventory/SiteForm.tsx src/components/inventory/RackForm.tsx src/components/inventory/DeviceForm.tsx
git commit -m "feat(inventory): add Site/Rack/Device form components"
```

---

### Task 9: Register the "Inventory" nav group

**Files:**
- Modify: `src/components/AppSidebar.tsx`

**Interfaces:**
- Produces: two new sidebar links, `/inventory/devices` and `/inventory/racks`.

- [ ] **Step 1: Add icon imports**

In `src/components/AppSidebar.tsx`, add `IconBoxSeam` and `IconStack2` to the existing `@tabler/icons-react` import block (after `IconClockPlay`):

```typescript
  IconHeartbeat,
  IconClockPlay,
  IconBoxSeam,
  IconStack2,
} from "@tabler/icons-react";
```

- [ ] **Step 2: Add the `"Inventory"` section to `ACI_NAV`**

Insert a new section into the `ACI_NAV` array, between the `"Infrastructure"` section and the `"Workflows"` section:

```typescript
  {
    group: "Inventory",
    items: [
      {
        href: "/inventory/devices",
        label: "Devices",
        icon: <IconBoxSeam size={15} stroke={1.75} />,
      },
      {
        href: "/inventory/racks",
        label: "Racks",
        icon: <IconStack2 size={15} stroke={1.75} />,
      },
    ],
  },
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i AppSidebar`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppSidebar.tsx
git commit -m "feat(nav): add Inventory sidebar group"
```

---

### Task 10: Devices list page

**Files:**
- Create: `src/app/(app)/inventory/devices/page.tsx`
- Create: `src/app/(app)/inventory/devices/DevicesClient.tsx`

**Interfaces:**
- Consumes: `getDevices`, `createDevice`, `updateDevice`, `deleteDevice`, `type SafeDeviceWithRack` (Task 6), `parseDeviceListParams` (Task 5), `DeviceForm`, `FooterCancel`, `FooterSubmit` (Task 8), `getSession` (`src/lib/auth.ts`).
- Produces: the `/inventory/devices` route. Row click navigates to `/inventory/devices/[id]` (Task 11).

- [ ] **Step 1: Server page**

```tsx
// src/app/(app)/inventory/devices/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getDevices } from '@/actions/inventory/devices'
import { parseDeviceListParams } from '@/lib/inventory/device-query'
import { DevicesClient } from './DevicesClient'

export const metadata: Metadata = {
  title: 'Devices',
  description: 'Physical device inventory across all sites and racks.',
}

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const params = parseDeviceListParams(await searchParams)
  const { devices, total, page } = await getDevices(params)
  const role = session.user.role === 'admin' ? 'admin' : 'member'

  return (
    <DevicesClient
      initialDevices={devices}
      total={total}
      page={page}
      query={params.query}
      role={role}
    />
  )
}
```

- [ ] **Step 2: Client component**

```tsx
// src/app/(app)/inventory/devices/DevicesClient.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { IconPlus, IconPencil, IconTrash, IconSearch } from '@tabler/icons-react'
import { DeviceStatus } from '@prisma/client'

import {
  createDevice,
  updateDevice,
  deleteDevice,
  type SafeDeviceWithRack,
} from '@/actions/inventory/devices'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'
import { buildDeviceListUrl } from '@/lib/inventory/device-query'
import { DeviceForm } from '@/components/inventory/DeviceForm'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PLANNED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  MAINTENANCE: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  RETIRED: 'bg-zinc-500/15 text-zinc-500',
}

export function DevicesClient({
  initialDevices,
  total,
  page,
  query,
  role,
}: {
  initialDevices: SafeDeviceWithRack[]
  total: number
  page: number
  query: string
  role: 'admin' | 'member'
}) {
  const router = useRouter()
  const [devices, setDevices] = useState<SafeDeviceWithRack[]>(initialDevices)
  const [searchValue, setSearchValue] = useState(query)
  const [isPending, setIsPending] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editingDevice, setEditingDevice] = useState<SafeDeviceWithRack | null>(null)
  const [deletingDevice, setDeletingDevice] = useState<SafeDeviceWithRack | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / 20))
  const isAdmin = role === 'admin'

  const emptyDefaults: DeviceFormValues = {
    name: '',
    serialNumber: '',
    assetTag: null,
    status: DeviceStatus.ACTIVE,
    vendor: '',
    model: '',
    heightU: 1,
  }

  const createForm = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: emptyDefaults,
  })

  const editForm = useForm<DeviceUpdateFormValues>({
    resolver: zodResolver(deviceUpdateSchema),
    defaultValues: emptyDefaults,
  })

  function openEdit(device: SafeDeviceWithRack) {
    setEditingDevice(device)
    editForm.reset({
      name: device.name,
      serialNumber: device.serialNumber,
      assetTag: device.assetTag,
      status: device.status,
      vendor: device.vendor,
      model: device.model,
      heightU: device.heightU,
    })
    setEditOpen(true)
  }

  function openDelete(device: SafeDeviceWithRack) {
    setDeletingDevice(device)
    setDeleteOpen(true)
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildDeviceListUrl({ query: searchValue, page: 1 }))
  }

  function goToPage(nextPage: number) {
    router.push(buildDeviceListUrl({ query, page: nextPage }))
  }

  async function handleCreate(data: DeviceFormValues) {
    setIsPending(true)
    const result = await createDevice(data)
    setIsPending(false)
    if (result.success) {
      const withRack: SafeDeviceWithRack = { ...result.data, rack: null }
      setDevices((prev) => [withRack, ...prev])
      createForm.reset(emptyDefaults)
      setCreateOpen(false)
      toast.success('Device created')
    } else {
      toast.error(result.error)
    }
  }

  async function handleUpdate(data: DeviceUpdateFormValues) {
    if (!editingDevice) return
    setIsPending(true)
    const result = await updateDevice(editingDevice.id, data)
    setIsPending(false)
    if (result.success) {
      setDevices((prev) =>
        prev.map((d) => (d.id === editingDevice.id ? { ...d, ...result.data } : d)),
      )
      setEditOpen(false)
      setEditingDevice(null)
      toast.success('Device updated')
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    if (!deletingDevice) return
    setIsPending(true)
    const result = await deleteDevice(deletingDevice.id)
    setIsPending(false)
    if (result.success) {
      setDevices((prev) => prev.filter((d) => d.id !== deletingDevice.id))
      setDeleteOpen(false)
      setDeletingDevice(null)
      toast.success('Device deleted')
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Devices</h1>
            <p className="text-xs text-subtle mt-0.5">Physical device inventory</p>
          </div>
          <form onSubmit={submitSearch} className="relative flex-1 max-w-xs">
            <IconSearch size={13} stroke={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search name, serial, vendor..."
              className={SEARCH_INPUT_CLS}
            />
          </form>
          {isAdmin && (
            <button
              onClick={() => {
                createForm.reset(emptyDefaults)
                setCreateOpen(true)
              }}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
            >
              <IconPlus size={11} stroke={1.75} />
              Add Device
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Name', 'Serial', 'Status', 'Vendor / Model', 'Rack', ...(isAdmin ? [''] : [])].map((h) => (
                    <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-14 text-center">
                      <p className="text-sm text-subtle">No devices found</p>
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr
                      key={device.id}
                      className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100"
                    >
                      <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                        <Link href={`/inventory/devices/${device.id}`} className="font-medium text-foreground hover:underline">
                          {device.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-muted-foreground">{device.serialNumber}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLS[device.status] ?? ''}`}>
                          {device.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-subtle">{device.vendor} {device.model}</td>
                      <td className="px-4 py-2.5 text-subtle">
                        {device.rack ? `${device.rack.site.name} · ${device.rack.name}` : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(device)} title="Edit">
                              <IconPencil size={13} stroke={1.75} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openDelete(device)}
                              title="Delete"
                              className="text-faint hover:text-destructive"
                            >
                              <IconTrash size={13} stroke={1.75} />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-subtle">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) createForm.reset(emptyDefaults); setCreateOpen(open) }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">Add Device</DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Register a new device. Rack placement is done from the Racks page.
            </DialogDescription>
          </DialogHeader>
          <DeviceForm form={createForm} onSubmit={handleCreate} formId="create-device-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <FooterCancel onClick={() => setCreateOpen(false)} disabled={isPending} />
            <FooterSubmit form="create-device-form" disabled={isPending} label={isPending ? 'Adding…' : 'Add Device'} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditingDevice(null); setEditOpen(open) }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">Edit Device</DialogTitle>
            <DialogDescription className="text-xs text-subtle">Update device identity and hardware details.</DialogDescription>
          </DialogHeader>
          <DeviceForm form={editForm} onSubmit={handleUpdate} formId="edit-device-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <FooterCancel onClick={() => setEditOpen(false)} disabled={isPending} />
            <FooterSubmit form="edit-device-form" disabled={isPending} label={isPending ? 'Saving…' : 'Save Changes'} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) setDeletingDevice(null); setDeleteOpen(open) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingDevice?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This will permanently remove the device from inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel disabled={isPending} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="bg-error text-error-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "inventory/devices"`
Expected: no output.

- [ ] **Step 4: Manual check**

Run: `cd /home/furina/Projects/netroku-aci && bun run dev` (or the project's usual dev command), sign in as an admin, navigate to `/inventory/devices`. Expected: empty table with "Add Device" button. Create a device, confirm it appears in the table and a toast confirms success.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/inventory/devices/page.tsx" "src/app/(app)/inventory/devices/DevicesClient.tsx"
git commit -m "feat(inventory): add devices list page"
```

---

### Task 11: Device detail page

**Files:**
- Create: `src/app/(app)/inventory/devices/[id]/page.tsx`

**Interfaces:**
- Consumes: `getDeviceById`, `type SafeDeviceWithRack` (Task 6).
- Produces: the `/inventory/devices/[id]` route, linked from Task 10's table rows.

- [ ] **Step 1: Write the page**

```tsx
// src/app/(app)/inventory/devices/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { IconServer } from '@tabler/icons-react'
import { getSession } from '@/lib/auth'
import { getDeviceById } from '@/actions/inventory/devices'

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PLANNED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  MAINTENANCE: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  RETIRED: 'bg-zinc-500/15 text-zinc-500',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const device = await getDeviceById(id)
  return { title: device?.name ?? 'Device' }
}

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { id } = await params
  const device = await getDeviceById(id)
  if (!device) notFound()

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-border p-6">
        <div className="bg-muted flex size-16 items-center justify-center rounded-lg">
          <IconServer size={28} stroke={1.5} className="text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{device.name}</h1>
          <p className="text-muted-foreground text-sm">{device.vendor} {device.model}</p>
          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLS[device.status] ?? ''}`}>
            {device.status}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">General Information</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Serial</dt>
              <dd className="font-mono">{device.serialNumber}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Asset Tag</dt>
              <dd className="font-mono">{device.assetTag ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd>{new Date(device.updatedAt).toLocaleString()}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Hardware</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Vendor</dt>
              <dd>{device.vendor}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Model</dt>
              <dd>{device.model}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Height</dt>
              <dd>{device.heightU}U</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Location</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Site</dt>
              <dd>
                {device.rack ? (
                  <Link href={`/inventory/racks?siteId=${device.rack.site.id}`} className="text-primary hover:underline">
                    {device.rack.site.name}
                  </Link>
                ) : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Rack</dt>
              <dd>{device.rack?.name ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Position</dt>
              <dd>{device.rackPosition != null ? `Unit ${device.rackPosition}` : '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "devices/\[id\]"`
Expected: no output.

- [ ] **Step 3: Manual check**

Navigate to a device row created in Task 10's manual check, click its name, confirm the detail page renders with correct fields and "Location" shows `—` (device is unassigned at this point).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/inventory/devices/[id]/page.tsx"
git commit -m "feat(inventory): add device detail page"
```

---

### Task 12: Rack visualization component (core port)

**Files:**
- Create: `src/components/inventory/RackVisualization.tsx`

**Interfaces:**
- Consumes: `canPlaceDevice`, `type PlaceableDevice` (Task 2), `updateDevicePlacement`, `clearDevicePlacement`, `updateDeviceHeight`, `type DeviceCatalogEntry` (Task 6).
- Produces: `type RackDevice`, `type RackItem`, `type DragPayload`, `type HoverTarget`, the `RackVisualization` component (renders a single rack, takes an `isAdmin: boolean` prop). Consumed by Task 13 (`RacksClient`), which owns all the state this component receives as props (mirrors netroku's split between `RackVisualization` and `RackVisualizationTabs`).

This is a faithful, string-id port of netroku's `RackVisualization` (the inner component from `rack-visualization-tabs.tsx`) — same grid math, same native HTML5 drag-and-drop, same collision preview, same menus. Icons swapped from `lucide-react` to `@tabler/icons-react`. State ownership (drag payload, hover target, pending ids, active menu) stays in the parent (Task 13), matching netroku's split.

**Deviation from netroku:** this component takes an `isAdmin` prop (netroku's has no role gating at all — its whole app has no per-mutation admin check). When `isAdmin` is `false`, the component renders fully read-only: no draggable grip handle, no empty-unit "Add device" menu, no per-device Expand/Shrink/Remove menu — see Step 1's `isAdmin` branches inline, not bolted on afterward.

- [ ] **Step 1: Write the component**

```tsx
// src/components/inventory/RackVisualization.tsx
'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { IconGripVertical, IconTrash } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canPlaceDevice, type PlaceableDevice } from '@/lib/inventory/rack-placement'
import type { DeviceCatalogEntry } from '@/actions/inventory/devices'

export type RackDevice = {
  id: string
  name: string
  serialNumber: string
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
}

export type RackItem = {
  id: string
  name: string
  heightU: number
  devices: RackDevice[]
}

export type DragPayload = {
  deviceId: string
  heightU: number
}

export type HoverTarget = {
  rackId: string
  topUnit: number
} | null

function toRackPlacement(rackHeight: number, device: RackDevice) {
  if (!device.rackPosition) return null

  const height = Math.max(1, device.heightU)
  const topUnit = device.rackPosition + height - 1
  if (topUnit > rackHeight) return null

  const rowStart = rackHeight - topUnit + 1
  return { rowStart, rowSpan: height }
}

export function RackVisualization({
  rack,
  onDropDevice,
  allDevices,
  onUnassignDevice,
  onResizeDeviceU,
  onDragStartDevice,
  onDragEndDevice,
  onHoverUnit,
  activeMenuDeviceId,
  onMenuDeviceChange,
  hoverTarget,
  draggingPayload,
  pendingDeviceIds,
  isAdmin,
}: {
  rack: RackItem
  onDropDevice: (rackId: string, targetTopUnit: number, payload: DragPayload) => void
  allDevices: DeviceCatalogEntry[]
  onUnassignDevice: (deviceId: string) => void
  onResizeDeviceU: (deviceId: string, delta: number) => void
  onDragStartDevice: (payload: DragPayload) => void
  onDragEndDevice: () => void
  onHoverUnit: (rackId: string, topUnit: number) => void
  activeMenuDeviceId: string | null
  onMenuDeviceChange: (deviceId: string | null) => void
  hoverTarget: HoverTarget
  draggingPayload: DragPayload | null
  pendingDeviceIds: Set<string>
  isAdmin: boolean
}) {
  const [rowSearchByKey, setRowSearchByKey] = React.useState<Record<string, string>>({})
  const units = Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i)

  const placedDevices = rack.devices
    .map((device) => {
      const placement = toRackPlacement(rack.heightU, device)
      if (!placement) return null
      return { ...device, ...placement }
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d))

  const occupiedUnits = React.useMemo(() => {
    const result = new Set<number>()
    for (const device of rack.devices) {
      if (!device.rackPosition) continue
      const height = Math.max(1, device.heightU)
      for (let i = device.rackPosition; i < device.rackPosition + height; i += 1) {
        result.add(i)
      }
    }
    return result
  }, [rack.devices])

  const placeableSiblings: PlaceableDevice[] = rack.devices.map((d) => ({
    id: d.id,
    rackPosition: d.rackPosition,
    heightU: d.heightU,
  }))

  const highlightedRange = React.useMemo(() => {
    if (!draggingPayload || !hoverTarget || hoverTarget.rackId !== rack.id) return null

    const start = hoverTarget.topUnit - draggingPayload.heightU + 1
    const end = hoverTarget.topUnit
    if (start < 1 || end > rack.heightU) return { start, end, valid: false }

    const valid = canPlaceDevice(
      placeableSiblings,
      draggingPayload.deviceId,
      start,
      draggingPayload.heightU,
      rack.heightU,
    )
    return { start, end, valid }
  }, [draggingPayload, hoverTarget, rack.id, rack.heightU, placeableSiblings])

  function handleDropEvent(event: React.DragEvent<HTMLDivElement>, unit: number) {
    event.preventDefault()
    event.stopPropagation()
    const raw = event.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as DragPayload
      onDropDevice(rack.id, unit, payload)
    } catch {
      // Ignore invalid drag payloads.
    }
  }

  return (
    <Card className="border-zinc-300 bg-zinc-50/70 dark:border-[#2a2a2a] dark:bg-[#181818]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{rack.name}</CardTitle>
          <Badge variant="outline" className="dark:border-[#3a3a3a] dark:bg-[#212121] dark:text-[#d4d4d4]">
            {rack.heightU}U
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden rounded-md border border-zinc-300 dark:border-[#2f2f2f]">
          <div
            className="grid grid-cols-[52px_1fr] bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[#181818] dark:to-[#212121]"
            style={{ gridTemplateRows: `repeat(${rack.heightU}, minmax(32px, 1fr))` }}
          >
            {units.map((unit) => {
              const inHighlight =
                highlightedRange && unit >= highlightedRange.start && unit <= highlightedRange.end
              const cellClass = [
                'border-l border-b border-dashed border-zinc-300 transition-colors dark:border-[#2f2f2f]',
                inHighlight
                  ? highlightedRange.valid
                    ? 'bg-zinc-300/70 dark:bg-[#353535]'
                    : 'bg-zinc-400/70 dark:bg-[#4a2f2f]'
                  : 'hover:bg-zinc-200/50 dark:hover:bg-[#262626]',
              ].join(' ')

              return (
                <React.Fragment key={unit}>
                  <div className="border-b border-zinc-300 px-2 py-1 text-right text-[11px] font-medium text-zinc-600 dark:border-[#2f2f2f] dark:text-[#a3a3a3]">
                    U{String(unit).padStart(2, '0')}
                  </div>
                  {occupiedUnits.has(unit) || !isAdmin ? (
                    <div
                      data-rack-u="true"
                      className={cellClass}
                      {...(isAdmin
                        ? {
                            onDragEnter: () => onHoverUnit(rack.id, unit),
                            onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
                              event.preventDefault()
                              onHoverUnit(rack.id, unit)
                            },
                            onDrop: (event: React.DragEvent<HTMLDivElement>) => handleDropEvent(event, unit),
                          }
                        : {})}
                    />
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div
                          data-rack-u="true"
                          className={cellClass}
                          onDragEnter={() => onHoverUnit(rack.id, unit)}
                          onDragOver={(event) => {
                            event.preventDefault()
                            onHoverUnit(rack.id, unit)
                          }}
                          onDrop={(event) => handleDropEvent(event, unit)}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                        {(() => {
                          const searchKey = `${rack.id}-${unit}`
                          const query = (rowSearchByKey[searchKey] ?? '').trim().toLowerCase()
                          const filteredDevices = allDevices.filter((device) => {
                            if (!query) return true
                            const target = `${device.name} ${device.serialNumber}`.toLowerCase()
                            return target.includes(query)
                          })

                          return (
                            <>
                              <DropdownMenuLabel>Add device to U{unit}</DropdownMenuLabel>
                              <div className="px-2 pb-2" onPointerDown={(event) => event.stopPropagation()}>
                                <Input
                                  value={rowSearchByKey[searchKey] ?? ''}
                                  onChange={(event) =>
                                    setRowSearchByKey((prev) => ({ ...prev, [searchKey]: event.target.value }))
                                  }
                                  onKeyDown={(event) => event.stopPropagation()}
                                  placeholder="Search device or serial..."
                                  className="h-8"
                                />
                              </div>
                              <DropdownMenuSeparator />
                              {filteredDevices.length > 0 ? (
                                filteredDevices.map((device) => (
                                  <DropdownMenuItem
                                    key={`${rack.id}-${unit}-${device.id}`}
                                    onSelect={(event) => {
                                      event.preventDefault()
                                      onDropDevice(rack.id, unit, {
                                        deviceId: device.id,
                                        heightU: Math.max(1, device.heightU),
                                      })
                                    }}
                                  >
                                    <div className="flex w-full items-center justify-between gap-2">
                                      <span className="truncate">{device.name} · {device.serialNumber}</span>
                                      <span className="text-muted-foreground shrink-0 text-[10px]">
                                        {device.rackId !== null && device.rackPosition !== null
                                          ? `Rack ${device.rackId} · U${device.rackPosition}`
                                          : ''}
                                      </span>
                                    </div>
                                  </DropdownMenuItem>
                                ))
                              ) : (
                                <DropdownMenuItem disabled>No device found</DropdownMenuItem>
                              )}
                            </>
                          )
                        })()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          <div
            className="pointer-events-none absolute inset-y-0 right-0 left-[52px] grid px-1 py-0"
            style={{ gridTemplateRows: `repeat(${rack.heightU}, minmax(32px, 1fr))` }}
          >
            {placedDevices.map((device) => {
              const cardBody = (
                <div
                  data-device-card="true"
                  className={[
                    'pointer-events-auto relative z-10 mx-1 my-0 flex h-full min-h-0 cursor-pointer flex-col justify-center overflow-hidden rounded border border-zinc-500 bg-zinc-300 py-1 pr-2 pl-7 text-xs text-zinc-900 shadow-sm transition-all dark:border-[#474747] dark:bg-[#2b2b2b] dark:text-[#e5e5e5]',
                    draggingPayload?.deviceId === device.id
                      ? '-translate-y-0.5 scale-[1.06] bg-zinc-200 shadow-2xl ring-2 ring-zinc-500/70 dark:bg-[#3a3a3a] dark:ring-zinc-300/40'
                      : '',
                  ].join(' ')}
                  style={{
                    gridRow: `${device.rowStart} / span ${device.rowSpan}`,
                    opacity:
                      pendingDeviceIds.has(device.id) || draggingPayload?.deviceId === device.id ? 0.55 : 1,
                  }}
                  title={`${device.name} (${device.serialNumber})`}
                >
                  {isAdmin && (
                    <div
                      draggable={!pendingDeviceIds.has(device.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        const payload: DragPayload = {
                          deviceId: device.id,
                          heightU: Math.max(1, device.heightU),
                        }
                        const dragCard = event.currentTarget.closest("[data-device-card='true']") as HTMLElement | null
                        if (dragCard) {
                          event.dataTransfer.setDragImage(dragCard, dragCard.clientWidth / 2, dragCard.clientHeight / 2)
                        }
                        onDragStartDevice(payload)
                        onMenuDeviceChange(null)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/json', JSON.stringify(payload))
                      }}
                      onDragEnd={onDragEndDevice}
                      className="absolute top-1/2 left-1 flex size-4 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm text-zinc-600 opacity-70 hover:bg-zinc-400/30 hover:opacity-100 active:cursor-grabbing dark:text-zinc-300 dark:hover:bg-zinc-600/30"
                      title="Drag device"
                    >
                      <IconGripVertical size={12} stroke={1.75} />
                    </div>
                  )}
                  {device.rowSpan === 1 ? (
                    <div className="truncate text-[11px] leading-none font-semibold">
                      {device.name} · {device.serialNumber}
                    </div>
                  ) : (
                    <>
                      <div className="truncate font-semibold leading-tight">{device.name}</div>
                      <div className="truncate text-[10px] leading-tight opacity-80">{device.serialNumber}</div>
                    </>
                  )}
                </div>
              )

              if (!isAdmin) {
                return <React.Fragment key={device.id}>{cardBody}</React.Fragment>
              }

              return (
                <DropdownMenu
                  key={device.id}
                  open={activeMenuDeviceId === device.id}
                  onOpenChange={(open) => onMenuDeviceChange(open ? device.id : null)}
                >
                  <DropdownMenuTrigger asChild>{cardBody}</DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onResizeDeviceU(device.id, 1)
                      }}
                    >
                      Expand U (+1)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={device.heightU <= 1}
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onResizeDeviceU(device.id, -1)
                      }}
                    >
                      Shrink U (-1)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onUnassignDevice(device.id)
                      }}
                    >
                      <IconTrash size={13} stroke={1.75} />
                      Remove from rack
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i RackVisualization`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/components/inventory/RackVisualization.tsx
git commit -m "feat(inventory): port rack visualization grid component"
```

---

### Task 13: Racks page (site selection, inline Site/Rack CRUD, visualization grid)

**Files:**
- Create: `src/app/(app)/inventory/racks/page.tsx`
- Create: `src/app/(app)/inventory/racks/RacksClient.tsx`

**Interfaces:**
- Consumes: `getSites`, `createSite`, `updateSite`, `deleteSite`, `type SafeSite` (Task 4); `getRacksBySite`, `createRack`, `updateRack`, `deleteRack`, `type SafeRackWithDevices` (Task 7); `getAllDevices`, `updateDevicePlacement`, `clearDevicePlacement`, `updateDeviceHeight`, `type DeviceCatalogEntry` (Task 6); `SiteForm`, `RackForm`, `FooterCancel`, `FooterSubmit` (Task 8); `RackVisualization`, `type RackItem`, `type DragPayload`, `type HoverTarget` (Task 12).
- Produces: the `/inventory/racks` route (final task — completes the feature).

- [ ] **Step 1: Server page**

```tsx
// src/app/(app)/inventory/racks/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { getSites } from '@/actions/inventory/sites'
import { getRacksBySite } from '@/actions/inventory/racks'
import { getAllDevices } from '@/actions/inventory/devices'
import { RacksClient } from './RacksClient'

export const metadata: Metadata = {
  title: 'Racks',
  description: 'Site-by-site rack elevation and device placement.',
}

export default async function RacksPage({
  searchParams,
}: {
  searchParams: Promise<{ siteId?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/signin')

  const { siteId: siteIdParam } = await searchParams
  const [sites, allDevices] = await Promise.all([getSites(), getAllDevices()])

  const selectedSiteId =
    siteIdParam && sites.some((site) => site.id === siteIdParam)
      ? siteIdParam
      : (sites[0]?.id ?? null)

  const racks = selectedSiteId ? await getRacksBySite(selectedSiteId) : []
  const role = session.user.role === 'admin' ? 'admin' : 'member'

  return (
    <RacksClient
      sites={sites}
      selectedSiteId={selectedSiteId}
      racks={racks}
      allDevices={allDevices}
      role={role}
    />
  )
}
```

- [ ] **Step 2: Client component**

```tsx
// src/app/(app)/inventory/racks/RacksClient.tsx
'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import { createSite, deleteSite, updateSite, type SafeSite } from '@/actions/inventory/sites'
import { createRack, deleteRack, updateRack, type SafeRackWithDevices } from '@/actions/inventory/racks'
import {
  clearDevicePlacement,
  updateDeviceHeight,
  updateDevicePlacement,
  type DeviceCatalogEntry,
} from '@/actions/inventory/devices'
import { siteSchema, type SiteFormValues } from '@/lib/schemas/site'
import { rackSchema, type RackFormValues } from '@/lib/schemas/rack'
import { SiteForm } from '@/components/inventory/SiteForm'
import { RackForm } from '@/components/inventory/RackForm'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'
import {
  RackVisualization,
  type DragPayload,
  type HoverTarget,
  type RackItem,
} from '@/components/inventory/RackVisualization'
import { canPlaceDevice, type PlaceableDevice } from '@/lib/inventory/rack-placement'

export function RacksClient({
  sites,
  selectedSiteId,
  racks,
  allDevices,
  role,
}: {
  sites: SafeSite[]
  selectedSiteId: string | null
  racks: SafeRackWithDevices[]
  allDevices: DeviceCatalogEntry[]
  role: 'admin' | 'member'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isAdmin = role === 'admin'

  const [siteList, setSiteList] = React.useState<SafeSite[]>(sites)
  const [rackList, setRackList] = React.useState<RackItem[]>(
    racks.map((rack) => ({ id: rack.id, name: rack.name, heightU: rack.heightU, devices: rack.devices })),
  )
  const [prevSites, setPrevSites] = React.useState(sites)
  if (sites !== prevSites) {
    setPrevSites(sites)
    setSiteList(sites)
  }

  const [prevRacks, setPrevRacks] = React.useState(racks)
  if (racks !== prevRacks) {
    setPrevRacks(racks)
    setRackList(racks.map((rack) => ({ id: rack.id, name: rack.name, heightU: rack.heightU, devices: rack.devices })))
  }

  const [deviceCatalog, setDeviceCatalog] = React.useState<DeviceCatalogEntry[]>(allDevices)
  const [prevAllDevices, setPrevAllDevices] = React.useState(allDevices)
  if (allDevices !== prevAllDevices) {
    setPrevAllDevices(allDevices)
    setDeviceCatalog(allDevices)
  }

  const [pendingDeviceIds, setPendingDeviceIds] = React.useState<Set<string>>(new Set())
  const [draggingPayload, setDraggingPayload] = React.useState<DragPayload | null>(null)
  const [hoverTarget, setHoverTarget] = React.useState<HoverTarget>(null)
  const [activeMenuDeviceId, setActiveMenuDeviceId] = React.useState<string | null>(null)

  const [siteDialogOpen, setSiteDialogOpen] = React.useState(false)
  const [editingSite, setEditingSite] = React.useState<SafeSite | null>(null)
  const [deleteSiteOpen, setDeleteSiteOpen] = React.useState(false)
  const [isSitePending, setIsSitePending] = React.useState(false)

  const [rackDialogOpen, setRackDialogOpen] = React.useState(false)
  const [editingRack, setEditingRack] = React.useState<RackItem | null>(null)
  const [deletingRack, setDeletingRack] = React.useState<RackItem | null>(null)
  const [deleteRackOpen, setDeleteRackOpen] = React.useState(false)
  const [isRackPending, setIsRackPending] = React.useState(false)

  const buildSiteHref = React.useCallback(
    (nextSiteId: string | null) => {
      const nextParams = new URLSearchParams(searchParams.toString())
      if (nextSiteId === null) nextParams.delete('siteId')
      else nextParams.set('siteId', nextSiteId)
      const query = nextParams.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [pathname, searchParams],
  )

  const siteForm = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: { name: '', address: '', latitude: null, longitude: null },
  })

  const rackForm = useForm<RackFormValues>({
    resolver: zodResolver(rackSchema),
    defaultValues: { name: '', heightU: 42, siteId: selectedSiteId ?? '' },
  })

  function openCreateSite() {
    setEditingSite(null)
    siteForm.reset({ name: '', address: '', latitude: null, longitude: null })
    setSiteDialogOpen(true)
  }

  function openEditSite() {
    const site = siteList.find((s) => s.id === selectedSiteId) ?? null
    if (!site) return
    setEditingSite(site)
    siteForm.reset({ name: site.name, address: site.address, latitude: site.latitude, longitude: site.longitude })
    setSiteDialogOpen(true)
  }

  async function handleSubmitSite(data: SiteFormValues) {
    setIsSitePending(true)
    const result = editingSite ? await updateSite(editingSite.id, data) : await createSite(data)
    setIsSitePending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (editingSite) {
      setSiteList((prev) => prev.map((s) => (s.id === result.data.id ? result.data : s)).sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Site updated')
    } else {
      setSiteList((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Site created')
      router.push(buildSiteHref(result.data.id))
    }
    setSiteDialogOpen(false)
    router.refresh()
  }

  async function handleDeleteSite() {
    if (!selectedSiteId) return
    setIsSitePending(true)
    const result = await deleteSite(selectedSiteId)
    setIsSitePending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    const remaining = siteList.filter((s) => s.id !== selectedSiteId)
    setSiteList(remaining)
    setDeleteSiteOpen(false)
    toast.success('Site deleted')
    router.push(buildSiteHref(remaining[0]?.id ?? null))
    router.refresh()
  }

  function openCreateRack() {
    if (!selectedSiteId) return
    setEditingRack(null)
    rackForm.reset({ name: '', heightU: 42, siteId: selectedSiteId })
    setRackDialogOpen(true)
  }

  function openEditRack(rack: RackItem) {
    setEditingRack(rack)
    rackForm.reset({ name: rack.name, heightU: rack.heightU, siteId: selectedSiteId ?? '' })
    setRackDialogOpen(true)
  }

  async function handleSubmitRack(data: RackFormValues) {
    setIsRackPending(true)
    const result = editingRack ? await updateRack(editingRack.id, data) : await createRack(data)
    setIsRackPending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (editingRack) {
      setRackList((prev) =>
        prev.map((r) => (r.id === result.data.id ? { ...r, name: result.data.name, heightU: result.data.heightU } : r)),
      )
      toast.success('Rack updated')
    } else {
      setRackList((prev) => [...prev, { id: result.data.id, name: result.data.name, heightU: result.data.heightU, devices: [] }])
      toast.success('Rack created')
    }
    setRackDialogOpen(false)
    router.refresh()
  }

  async function handleDeleteRack() {
    if (!deletingRack) return
    setIsRackPending(true)
    const result = await deleteRack(deletingRack.id)
    setIsRackPending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setRackList((prev) => prev.filter((r) => r.id !== deletingRack.id))
    setDeleteRackOpen(false)
    setDeletingRack(null)
    toast.success('Rack deleted')
    router.refresh()
  }

  function handleSelectSiteChange(nextValue: string) {
    if (!nextValue) return
    router.push(buildSiteHref(nextValue))
  }

  function moveDeviceLocally(payload: DragPayload, toRackId: string, rackPosition: number) {
    setRackList((prev) => {
      const next = prev.map((rack) => ({ ...rack, devices: [...rack.devices] }))
      let movedDevice = null as RackItem['devices'][number] | null

      for (const rack of next) {
        const index = rack.devices.findIndex((d) => d.id === payload.deviceId)
        if (index !== -1) {
          const [device] = rack.devices.splice(index, 1)
          movedDevice = device
          break
        }
      }

      if (!movedDevice) {
        const catalogDevice = deviceCatalog.find((d) => d.id === payload.deviceId)
        if (!catalogDevice) return prev
        movedDevice = {
          id: catalogDevice.id,
          name: catalogDevice.name,
          serialNumber: catalogDevice.serialNumber,
          rackPosition,
          vendor: catalogDevice.vendor,
          model: catalogDevice.model,
          heightU: Math.max(1, catalogDevice.heightU),
        }
      }

      const targetRack = next.find((r) => r.id === toRackId)
      if (!targetRack) return prev

      targetRack.devices.push({ ...movedDevice, rackPosition })
      targetRack.devices.sort((a, b) => (a.rackPosition ?? 0) - (b.rackPosition ?? 0))
      return next
    })
  }

  async function handleDropDevice(rackId: string, targetTopUnit: number, payload: DragPayload) {
    const targetRack = rackList.find((r) => r.id === rackId)
    if (!targetRack) return

    const rackPosition = targetTopUnit - payload.heightU + 1
    if (rackPosition < 1) return

    const siblings: PlaceableDevice[] = targetRack.devices.map((d) => ({
      id: d.id,
      rackPosition: d.rackPosition,
      heightU: d.heightU,
    }))
    if (!canPlaceDevice(siblings, payload.deviceId, rackPosition, payload.heightU, targetRack.heightU)) {
      toast.error('Cannot place device here due to rack collision.')
      return
    }

    const previous = rackList
    moveDeviceLocally(payload, rackId, rackPosition)
    setDraggingPayload(null)
    setHoverTarget(null)
    setPendingDeviceIds((prev) => new Set(prev).add(payload.deviceId))

    const result = await updateDevicePlacement(payload.deviceId, rackId, rackPosition)

    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(payload.deviceId)
      return next
    })

    if (!result.success) {
      setRackList(previous)
      toast.error(result.error)
      return
    }

    setDeviceCatalog((prev) =>
      prev.map((d) => (d.id === payload.deviceId ? { ...d, rackId, rackPosition } : d)),
    )
    toast.success('Device position updated')
  }

  async function handleUnassignDevice(deviceId: string) {
    setPendingDeviceIds((prev) => new Set(prev).add(deviceId))
    const result = await clearDevicePlacement(deviceId)
    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setRackList((prev) => prev.map((rack) => ({ ...rack, devices: rack.devices.filter((d) => d.id !== deviceId) })))
    setDeviceCatalog((prev) => prev.map((d) => (d.id === deviceId ? { ...d, rackId: null, rackPosition: null } : d)))
    toast.success('Device removed from rack')
  }

  async function handleResizeDeviceU(deviceId: string, delta: number) {
    const located = rackList
      .flatMap((rack) => rack.devices.map((device) => ({ rack, device })))
      .find((entry) => entry.device.id === deviceId)

    if (!located) {
      toast.error('Device not found')
      return
    }

    const nextHeight = located.device.heightU + delta
    if (nextHeight < 1) return

    if (
      located.device.rackPosition !== null &&
      !canPlaceDevice(
        located.rack.devices.map((d) => ({ id: d.id, rackPosition: d.rackPosition, heightU: d.heightU })),
        deviceId,
        located.device.rackPosition,
        nextHeight,
        located.rack.heightU,
      )
    ) {
      toast.error('Cannot resize: not enough free U space.')
      return
    }

    setPendingDeviceIds((prev) => new Set(prev).add(deviceId))
    const result = await updateDeviceHeight(deviceId, nextHeight)
    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setRackList((prev) =>
      prev.map((rack) => ({
        ...rack,
        devices: rack.devices.map((d) => (d.id === deviceId ? { ...d, heightU: nextHeight } : d)),
      })),
    )
    setDeviceCatalog((prev) => prev.map((d) => (d.id === deviceId ? { ...d, heightU: nextHeight } : d)))
    toast.success(`Device resized to ${nextHeight}U`)
  }

  const selectedSite = siteList.find((s) => s.id === selectedSiteId) ?? null

  if (siteList.length === 0) {
    return (
      <div className="px-8 py-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
          <p className="text-muted-foreground text-sm">Create a site to start visualizing racks.</p>
        </div>
        {isAdmin && (
          <div className="rounded-lg border border-border p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">No sites found.</p>
              <Button size="sm" onClick={openCreateSite}>
                <IconPlus size={14} stroke={1.75} />
                Create Site
              </Button>
            </div>
          </div>
        )}
        <SiteDialog
          open={siteDialogOpen}
          onOpenChange={setSiteDialogOpen}
          editing={editingSite}
          form={siteForm}
          onSubmit={handleSubmitSite}
          isPending={isSitePending}
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
        <p className="text-muted-foreground text-sm">Select a site to view its rack elevation.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
          <label htmlFor="rack-site-select" className="text-xs font-medium text-foreground">Site</label>
          <NativeSelect
            id="rack-site-select"
            value={selectedSiteId ?? ''}
            onChange={(e) => handleSelectSiteChange(e.target.value)}
            className="w-full"
          >
            {siteList.map((site) => (
              <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={openCreateSite}>
              <IconPlus size={14} stroke={1.75} />
              Create Site
            </Button>
            <Button size="sm" onClick={openCreateRack} disabled={!selectedSiteId}>
              <IconPlus size={14} stroke={1.75} />
              Create Rack
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={!selectedSiteId} aria-label="Site actions">
                  <IconDots size={16} stroke={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={openEditSite}>
                  <IconPencil size={13} stroke={1.75} />
                  Edit site
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault()
                    setDeleteSiteOpen(true)
                  }}
                >
                  <IconTrash size={13} stroke={1.75} />
                  Delete site
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Card className="border-zinc-300 bg-zinc-50/60 dark:border-[#2a2a2a] dark:bg-[#181818]">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">{selectedSite?.name ?? 'Selected Site'}</CardTitle>
            <Badge variant="outline">{rackList.length} rack{rackList.length === 1 ? '' : 's'}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Address: </span>{selectedSite?.address || '—'}</div>
          <div>
            <span className="text-muted-foreground">Coordinates: </span>
            {selectedSite?.latitude != null && selectedSite?.longitude != null
              ? `${selectedSite.latitude}, ${selectedSite.longitude}`
              : '—'}
          </div>
        </CardContent>
      </Card>

      {rackList.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-border p-6 text-sm">
          No racks for this site.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rackList.map((rack) => (
            <div key={rack.id} className="relative">
              {isAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" className="absolute top-3 right-3 z-20" aria-label="Rack actions">
                      <IconDots size={14} stroke={1.75} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openEditRack(rack)}>
                      <IconPencil size={13} stroke={1.75} />
                      Edit rack
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        event.preventDefault()
                        setDeletingRack(rack)
                        setDeleteRackOpen(true)
                      }}
                    >
                      <IconTrash size={13} stroke={1.75} />
                      Delete rack
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <RackVisualization
                rack={rack}
                onDropDevice={handleDropDevice}
                allDevices={deviceCatalog}
                onUnassignDevice={handleUnassignDevice}
                onResizeDeviceU={handleResizeDeviceU}
                onDragStartDevice={setDraggingPayload}
                onDragEndDevice={() => {
                  setDraggingPayload(null)
                  setHoverTarget(null)
                }}
                onHoverUnit={(rackId, topUnit) => {
                  if (!draggingPayload) return
                  setHoverTarget({ rackId, topUnit })
                }}
                activeMenuDeviceId={activeMenuDeviceId}
                onMenuDeviceChange={setActiveMenuDeviceId}
                hoverTarget={hoverTarget}
                draggingPayload={draggingPayload}
                pendingDeviceIds={pendingDeviceIds}
                isAdmin={isAdmin}
              />
            </div>
          ))}
        </div>
      )}

      <SiteDialog
        open={siteDialogOpen}
        onOpenChange={setSiteDialogOpen}
        editing={editingSite}
        form={siteForm}
        onSubmit={handleSubmitSite}
        isPending={isSitePending}
      />

      <AlertDialog open={deleteSiteOpen} onOpenChange={setDeleteSiteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete site?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Sites with racks cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSitePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteSite} disabled={isSitePending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={rackDialogOpen} onOpenChange={setRackDialogOpen}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              {editingRack ? 'Edit Rack' : 'Create Rack'}
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              {editingRack ? 'Update rack details.' : 'Add a new rack to the selected site.'}
            </DialogDescription>
          </DialogHeader>
          <RackForm form={rackForm} onSubmit={handleSubmitRack} formId="rack-form" sites={siteList} />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <FooterCancel onClick={() => setRackDialogOpen(false)} disabled={isRackPending} />
            <FooterSubmit form="rack-form" disabled={isRackPending} label={isRackPending ? 'Saving…' : editingRack ? 'Save Changes' : 'Create Rack'} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteRackOpen} onOpenChange={setDeleteRackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingRack?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Devices in this rack will be unassigned, not deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRackPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteRack} disabled={isRackPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SiteDialog({
  open,
  onOpenChange,
  editing,
  form,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: SafeSite | null
  form: ReturnType<typeof useForm<SiteFormValues>>
  onSubmit: (data: SiteFormValues) => void
  isPending: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="font-serif text-base font-semibold text-foreground">
            {editing ? 'Edit Site' : 'Create Site'}
          </DialogTitle>
          <DialogDescription className="text-xs text-subtle">
            {editing ? 'Update the site details.' : 'Add a new physical site.'}
          </DialogDescription>
        </DialogHeader>
        <SiteForm form={form} onSubmit={onSubmit} formId="site-form" />
        <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
          <FooterCancel onClick={() => onOpenChange(false)} disabled={isPending} />
          <FooterSubmit form="site-form" disabled={isPending} label={isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Site'} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p . 2>&1 | grep -i "inventory/racks"`
Expected: no output (`IconGripVertical`, `IconDots`, `IconPlus`, `IconPencil`, `IconTrash` are all confirmed present in the installed `@tabler/icons-react` version).

- [ ] **Step 4: Manual walkthrough**

Run the dev server, sign in as admin, go to `/inventory/racks`:
1. Create a site → confirm it becomes selected and the empty-state "No racks for this site" shows.
2. Create a rack (e.g. 42U) → confirm the rack grid renders with U42 at top, U01 at bottom.
3. Click an empty unit → confirm the "Add device to U{n}" menu lists the device created in Task 10, search-filters correctly, and selecting it places the device.
4. Drag the device's grip handle to a different unit → confirm the live highlight preview (gray = valid) tracks the cursor and the drop updates the position.
5. Try dragging to overlap another device (create a second device first) → confirm the highlight turns reddish and the drop is rejected with a toast.
6. Open the device card's menu → Expand U (+1) → confirm height increases and a collision against the rack boundary or another device is rejected with a toast.
7. Remove the device from the rack via its menu → confirm it disappears from the grid.
8. Edit and delete the rack via its own ellipsis menu → confirm both work and deleting unassigns any remaining devices rather than erroring.
9. Sign in as a non-admin (or temporarily flip the `role` prop while testing) → confirm Create Site/Create Rack/site ellipsis/rack ellipsis controls are hidden, and the rack grid itself is fully read-only: no grip handles, no empty-slot "Add device" menu, no per-device Expand/Shrink/Remove menu (this is `isAdmin` on `RackVisualization`, wired in Task 12 and passed through here) — but occupied units and device names are still visible.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/inventory/racks/page.tsx" "src/app/(app)/inventory/racks/RacksClient.tsx" src/components/inventory/RackVisualization.tsx
git commit -m "feat(inventory): add racks page with site/rack CRUD and admin-gated visualization"
```

---

### Task 14: Full-feature regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd /home/furina/Projects/netroku-aci && bun test`
Expected: all tests pass, including the new `rack-placement.test.ts` and `device-query.test.ts` suites, with no regressions in existing suites.

- [ ] **Step 2: Full typecheck**

Run: `cd /home/furina/Projects/netroku-aci && npx tsc --noEmit -p .`
Expected: exits 0 with no errors outside pre-existing `*.test.ts` false positives (per the Global Constraints / existing project note on `bun:test` type declarations).

- [ ] **Step 3: Lint**

Run: `cd /home/furina/Projects/netroku-aci && bun run lint` (project's `lint` script is `eslint` with no arguments — it lints the whole repo, not just the new files, so pre-existing warnings elsewhere are not this task's concern; only fail on errors touching files created/modified in Tasks 1–13).
Expected: no errors in the new `src/actions/inventory/`, `src/lib/inventory/`, `src/components/inventory/`, or `src/app/(app)/inventory/` files.

- [ ] **Step 4: End-to-end manual walkthrough**

Repeat Task 13 Step 4's full walkthrough once more end-to-end as a final sanity check, plus: delete a device from the Devices list, confirm it also disappears from any rack it was placed in; delete a site that still has a rack, confirm the friendly "Cannot delete a site that still has racks" error surfaces instead of a raw Prisma error.

- [ ] **Step 5: Confirm audit trail**

Navigate to `/history`, filter by the new inventory actions (`site.create`, `rack.create`, `device.create`, `device.place`, `device.resize`, `device.unassign`, etc. — from Task 3's `HISTORY_ACTION_LABELS`), confirm every mutation performed during the manual walkthroughs shows up with a correct actor and target.

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and commit there with a `fix:` message.
