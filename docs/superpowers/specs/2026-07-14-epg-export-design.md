# EPG Export — Design

**Date:** 2026-07-14
**Status:** Approved (pending spec review)

## Goal

Add an Excel (`.xlsx`) export to the EPG page (`/epgs`), mirroring the existing
endpoint export. The user chooses a **scope** (all EPGs for the host, or the
current filter set) and a **grouping** (by EPG or by Port), then downloads a
workbook whose layout depends on the grouping.

## UX

- An **Export** button in the EPG page header, placed next to **Resync**.
  Disabled when no APIC host is selected or the host has zero EPGs.
- A two-step dialog reusing the endpoint dialog's `ChoiceCard` styling and flow:
  - **Step 1 — Scope**
    - _All EPGs_ — every EPG for the selected host.
    - _Current filters_ — respects the active tenant / app-profile / node /
      search filters. Disabled (and non-selectable) when nothing matches.
    - Default scope: _Current filters_ when filters are active and match > 0,
      otherwise _All EPGs_ (mirrors `getDefaultExportScope`).
  - **Step 2 — Grouping**
    - _Group by EPG_
    - _Group by Port_
- On export: POST the payload to `/api/epgs/export`, download the returned blob
  using the `Content-Disposition` filename, close the dialog, toast on
  success/failure. Behaviour and error handling mirror `ExportEndpointsDialog`.

## Workbook layouts

Built with the `xlsx` library. Hierarchy is expressed with **merged cells**
(`worksheet['!merges']`), so sheets are assembled via `aoa_to_sheet` (array of
arrays) rather than `json_to_sheet`.

Sorting throughout uses a natural collator (`Intl.Collator` with `numeric:true`)
so `Eth1/2` sorts before `Eth1/10`.

### Group by EPG — one sheet, all EPGs

Single worksheet. Columns:

```
EPG | Tenant | Bridge Domain | EPG Description | Consumed | Provided | Node | Port
```

- One block per EPG, EPGs sorted by tenant then name.
- The six EPG-level columns (`EPG`, `Tenant`, `Bridge Domain`,
  `EPG Description`, `Consumed`, `Provided`) are **merged** across all rows of
  that EPG.
- Within an EPG, bindings are grouped by **leaf node**. A vPC binding stored as
  `1103-1104` is split into separate `1103` and `1104` node blocks. The `Node`
  cell is merged across that node's ports.
- One row per (node, port). Ports naturally sorted.
- `EPG` holds the full EPG name (e.g. `VLAN3192_EPG`).
- `Consumed` = `consumedContracts` joined with `, `; `Provided` =
  `providedContracts` joined with `, `. Empty string when the array is empty.
- An EPG with no bindings still gets a single row (EPG columns populated, Node
  and Port empty).

### Group by Port — one sheet per leaf node

One worksheet **per leaf node**, sheet named after the node (e.g. `1103`).
Columns:

```
Node | Port | EPG
```

- One row per port on that node, ports naturally sorted.
- `Node` is merged down the whole sheet (single node per sheet).
- `EPG` holds the comma-separated **full EPG names** deployed on that port
  (e.g. `VLAN3192_EPG, VLAN3193_EPG, VLAN3194_EPG`), sorted naturally.
- vPC bindings (`1103-1104`) contribute their ports to both the `1103` and
  `1104` sheets (leaf split).

Sheet names are sanitized to Excel's constraints (invalid chars replaced, max 31
chars, de-duplicated) — reuse the existing `sanitizeWorksheetName` /
uniqueness approach from the endpoint export.

## Data flow

Both groupings derive from a single query in the API route:

- Fetch `EpgSnapshot` rows for the host with `bindings` included.
- **Scope = all:** `where = { apicHostId }`.
- **Scope = filtered:** `where = buildEpgWhere(apicHostId, { query, tenant, ap })`
  (existing helper — matches tenant, app-profile, and the search query across EPG
  fields). When a `node` filter is present, apply it to each EPG's bindings by
  leaf-expanding the binding node and keeping only bindings whose leaf set
  intersects the selected nodes. EPGs left with zero matching bindings under an
  active node filter are dropped.
- Return 422 when no EPGs are in scope (mirrors endpoint route).

The node-filter binding logic lives in the export builder / a small helper so it
is unit-testable.

## Components / files

New:

- `src/lib/schemas/epg-export.ts` — zod `epgExportSchema`:
  `{ apicHostId, scope: 'all'|'filtered', groupBy: 'epg'|'port', filters?: { query?, tenant?, ap?, node? } }`
  plus `EpgExportRequest` type.
- `src/lib/epgs/export.ts` — `buildEpgWorkbook(epgs, groupBy)` and helpers:
  leaf-node expansion, natural sort, per-EPG / per-node grouping, merge-range
  construction, `sanitizeWorksheetName`, unique sheet naming.
- `src/lib/epgs/export.test.ts` — unit tests for grouping, leaf split,
  contract joining, merge ranges, sheet-per-node, sheet-name sanitisation.
- `src/app/api/epgs/export/route.ts` — auth'd POST: validate body, load host,
  query EPGs+bindings by scope, build workbook, stream `.xlsx` with a
  timestamped filename (`epgs-<host>-<scope>-by-<groupBy>-<ts>.xlsx`).
- `src/app/(app)/epgs/export-utils.ts` — `getDefaultExportScope`,
  `buildEpgExportPayload` (omit `filters` when scope is `all`).
- `src/app/(app)/epgs/ExportEpgsDialog.tsx` — button + two-step dialog
  (adapted from `ExportEndpointsDialog`).

Edited:

- `src/app/(app)/epgs/EpgsClient.tsx` — render `<ExportEpgsDialog>` in the header
  next to Resync; pass host id, EPG totals, and current filters
  (`{ query, tenant, ap, node }`).
- `src/app/(app)/epgs/page.tsx` — compute and pass EPG-level counts:
  `epgHostTotal = count(EpgSnapshot where apicHostId)` and
  `epgFilteredTotal = count(EpgSnapshot where buildEpgWhere(...))`. These are
  EPG counts (independent of the by-EPG / by-Port view toggle) so the dialog's
  scope choice is stable across views.
- `src/lib/epgs/query.ts` — add `hasActiveEpgFilters(filters)` (true when query,
  tenant, ap, or node is non-empty), mirroring `hasActiveEndpointFilters`.

## Testing

- Unit tests for `buildEpgWorkbook` and helpers (grouping, leaf split, contract
  join, merges, per-node sheets, sanitisation).
- Reuse existing route/dialog patterns; no new e2e required beyond manual
  verification of a real download.

## Out of scope

- CSV or other formats.
- Exporting contracts/domains detail beyond the Consumed/Provided name columns.
- Changing the on-page EPG/Port tables.
