# Inventory Management (Sites, Racks, Devices) — Design

Date: 2026-08-19
Branch: `feature/inventory-management`

## Goal

Port the Sites/Racks/Devices inventory feature — including the drag-and-drop rack
visualization — from the sibling project `netroku` into `netroku-aci`, adapted to
this project's conventions (server actions, Zod, shadcn, audit logging).

## Scope

In scope: Site, Rack, Device CRUD; rack U-slot visualization with drag-and-drop
placement, resize, and unassign; device list + detail page.

Out of scope: `DeviceStack`/stacking UI (netroku has no UI for it either — data
model only). netroku's `Interface`/`Endpoint` models are **not** ported — aci
already has its own ACI-monitoring Endpoints/Interfaces features that are a
different concept from physical device NICs, and those models were never added
to aci's `schema.prisma`.

## 1. Data model

The inventory models (`Site`, `Rack`, `DeviceStack`, `Device`, `DeviceStatus`,
`StackRole`) already exist in `prisma/schema.prisma` and have been migrated
(`prisma/migrations/20260818170652_add_device_inventory/`). Two inconsistencies
vs. the rest of the project's models need fixing via a **new** migration
(don't edit the already-applied one):

- Add `@@map("site")`, `@@map("rack")`, `@@map("device_stack")`, `@@map("device")`
  — every other model in the schema uses snake_case `@@map` table names; these
  four currently don't.
- Add `createdAt`/`updatedAt` to `Site` and `Rack` (currently missing entirely).
  `Device` keeps its existing `updatedAt` and gains `createdAt`.

Run `npx prisma migrate dev --name inventory_schema_fixes`.

Ids stay as `cuid()` strings (already the case in aci's schema, unlike netroku's
autoincrement ints) — the ported rack visualization and placement logic must be
adapted to string ids throughout.

## 2. Backend

### Schemas (`src/lib/schemas/{site,rack,device}.ts`)

Following `src/lib/schemas/apic-host.ts`'s pattern: one Zod schema per entity,
inferred TS type via `z.infer`.

- `siteSchema`: `name` (required string), `address` (optional string),
  `latitude`/`longitude` (optional number, nullable).
- `rackSchema`: `name` (required string), `heightU` (positive int),
  `siteId` (required string).
- `deviceSchema`: `name`, `serialNumber` (required, unique), `assetTag`
  (optional, unique), `status` (enum, default `ACTIVE`), `vendor`, `model`,
  `heightU` (positive int), `rackId` (optional string), `rackPosition`
  (optional positive int).

### Shared placement logic (`src/lib/inventory/rack-placement.ts`)

Pure, framework-free function ported from netroku's `canPlaceDevice`:

```ts
function canPlaceDevice(
  devices: { id: string; rackPosition: number | null; heightU: number }[],
  deviceId: string,
  rackPosition: number,
  heightU: number,
  rackHeightU: number,
): boolean
```

Bounds check (`1 <= start` and `end <= rackHeightU`) plus interval-overlap
check against every other device in the rack. Imported by both the client
component (live drag-preview highlighting) and the server actions (real
validation before write).

### Actions (`src/actions/inventory/{sites,racks,devices}.ts`)

Follow `src/actions/apic-hosts.ts` exactly:

- `ActionResult<T> = { success: true; data: T } | { success: false; error: string }`.
- `requireSession()` for reads, `requireAdmin()` for all mutations (per your
  answer: inventory mutations are admin-only).
- `schema.safeParse` → early-return on failure.
- `updateMany`/`deleteMany` + `result.count === 0` → not-found error.
- `recordAudit()` on every mutation; extend `AuditAction` in `src/lib/audit.ts`
  with: `site.create`, `site.update`, `site.delete`, `rack.create`,
  `rack.update`, `rack.delete`, `device.create`, `device.update`,
  `device.delete`, `device.place`, `device.unassign`, `device.resize`.
- Cached list reads via React `cache()`.

Reads:
- `getSites()` — all sites, ordered by name.
- `getRacksBySite(siteId)` — racks for a site, each with `devices` ordered by
  name (mirrors netroku's `getRackById`/site-scoped rack fetch).
- `getAllRacksForDropdown()` — unpaginated `{id, name, site: {name}}` for forms.
- `getAllDevices()` — full device catalog (id, name, serialNumber, rackId,
  rackPosition, vendor, model, heightU) for the racks page's "assign device to
  empty slot" search, across all racks/sites.
- `getDevices({page, search})` — paginated list for the Devices page.
- `getDeviceById(id)`.

Mutations:
- `createSite`, `updateSite`, `deleteSite`.
- `createRack`, `updateRack`, `deleteRack`.
- `createDevice`, `updateDevice`, `deleteDevice`.
- `updateDevicePlacement(deviceId, rackId, rackPosition)` — **hardened vs.
  netroku**: wraps a `prisma.$transaction` that re-reads the target rack's
  current devices and re-runs `canPlaceDevice` server-side before writing,
  returning `{success: false, error: 'Rack collision'}` if invalid. Closes the
  race/bypass gap netroku has (client-only validation there).
- `clearDevicePlacement(deviceId)` — unassign (null out `rackId`/`rackPosition`).
- `updateDeviceHeight(deviceId, heightU)` — same transactional re-validation
  pattern as placement.

## 3. Frontend

### Nav

New `"Inventory"` group in `src/components/AppSidebar.tsx` with two items:
Devices, Racks (icons from `@tabler/icons-react`, no `adminOnly` flag on the
nav items themselves — visibility is universal, but mutation controls inside
each page are admin-gated in the UI and enforced server-side).

### Routes

- `src/app/(app)/inventory/devices/page.tsx` (+ `DevicesClient.tsx`): session
  check, `getDevices()`, searchable/paginated hand-rolled table (apic-hosts
  style: plain `<table>` + `src/lib/ui-classes.ts` constants). Row click →
  `/inventory/devices/[id]`. Create/edit dialog uses `DeviceForm`
  (react-hook-form + zodResolver), delete via `AlertDialog`. Create/edit/delete
  controls only rendered for admins.
- `src/app/(app)/inventory/devices/[id]/page.tsx`: device detail — hero header
  (name, vendor+model, status badge), General/Hardware/Location info cards
  (Location links to `/inventory/racks?siteId=...` when placed), edit button
  opens `DeviceForm` in a drawer/dialog (fetches `getAllRacksForDropdown()` for
  the rack picker). Keyed by aci's cuid `id`, not serial number (netroku uses
  serial number in the URL; not needed here since ids are already opaque
  cuids, not sequential ints).
- `src/app/(app)/inventory/racks/page.tsx` (+ `RacksClient.tsx`): `?siteId=`
  search param, loads sites + all devices + selected site's racks (with
  devices). Renders:
  - Site selector (`NativeSelect` or shadcn `Select`), syncing to the URL.
  - Inline site CRUD: "Create Site" button, per-site edit/delete menu
    (`SiteForm` + `AlertDialog`) — matches netroku.
  - Inline rack CRUD (**new vs. netroku**, per your answer — netroku has no
    working rack-creation UI at all): "Create Rack" button, per-rack
    edit/delete menu (`RackForm` + `AlertDialog`).
  - Grid of `RackVisualization` components, one per rack in the selected site.
  - All create/edit/delete controls admin-gated in the UI.

## 4. Rack visualization component (core port)

`src/components/inventory/rack-visualization.tsx` (or similar) — faithful port
of netroku's `rack-visualization-tabs.tsx`, adapted to string ids:

**Grid math** (unchanged from netroku):
```ts
function toRackPlacement(rackHeight: number, device: RackDevice) {
  if (!device.rackPosition) return null;
  const height = Math.max(1, device.heightU);
  const topUnit = device.rackPosition + height - 1; // rackPosition = bottom unit
  if (topUnit > rackHeight) return null;
  const rowStart = rackHeight - topUnit + 1;
  return { rowStart, rowSpan: height };
}
```
- U labels count down from top (`heightU`) to bottom (`1`).
- Base grid: `grid-cols-[52px_1fr]`, `gridTemplateRows: repeat(heightU, minmax(32px,1fr))`.
- Device cards render in an absolutely-positioned overlay grid with the same
  row template, `pointer-events-none` on the container, `pointer-events-auto`
  per card.
- Empty units are click targets (`DropdownMenu` → "Add device to U{n}" with a
  search filter over the full device catalog). Occupied units are plain drop
  targets.

**Drag-and-drop** (unchanged — native HTML5 DnD, no library):
- `onDragStart` on a grip handle: serializes `{deviceId, heightU}` via
  `dataTransfer.setData`, custom drag image via `setDragImage`.
- `onDragEnter`/`onDragOver` on unit cells: sets `hoverTarget` (unit is always
  the device's **top** unit).
- `onDrop`: parses payload, calls the same handler as the empty-slot click
  path.
- Live highlight range while dragging: valid (light gray) / invalid (reddish)
  computed via the shared `canPlaceDevice`.

**Mutation flow** (unchanged): optimistic local state update → `pendingDeviceIds`
dims the card and blocks further drags → await server action → rollback +
error toast on failure, patch `deviceCatalog` on success.

**Per-device menu**: Expand U (+1), Shrink U (-1, disabled at `heightU<=1`),
Remove from rack (destructive). Re-runs `canPlaceDevice` client-side before
firing the resize action (server re-validates too, per §2).

**Styling**: unchanged — neutral zinc/gray, no color-by-status, no front/back
view toggle (matches source; not in scope to add).

## 5. Forms

`react-hook-form` + `@hookform/resolvers/zod`, shadcn `Form`/`FormField`/etc.
`SiteForm`, `RackForm`, `DeviceForm` are presentation-only (take
`defaultValues?`, `onSubmit`, `isPending`); the parent component owns the
`useTransition()` + `ActionResult` handling (toast, close dialog,
`router.refresh()` or local state patch) — matches both netroku's form
structure and aci's existing `ApicHostForm` convention.

## 6. Testing

`bun test` (bun:test) unit tests:
- `canPlaceDevice`: bounds edge cases (top/bottom of rack), overlap detection,
  self-exclusion (device doesn't collide with itself), zero/negative height
  guard.
- Server actions: admin-gating rejects non-admin mutation attempts, Zod
  validation failure paths, collision rejection on `updateDevicePlacement`/
  `updateDeviceHeight` (including the transactional re-validation).

Manual browser walkthrough after implementation: create site → create rack →
drag device into rack → resize → move between racks → unassign → delete
(cascade/restrict behavior per the FK constraints already in the migration).
