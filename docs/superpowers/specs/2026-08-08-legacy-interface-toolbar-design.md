# Legacy Interface Toolbar and Data Views Design

## Goal

Bring the Legacy Interfaces toolbar and table interactions in line with the ACI Interfaces page. Replace the form-driven filter and sort controls with immediate URL-driven search, device filtering, view tabs, counter-mode tabs, and clickable table headers. Add Legacy Counting CRC and State Changes views, default to hostname ordering, and sort interface names naturally.

This design extends `2026-08-08-legacy-interface-state-display-design.md`. Its binary Admin/Oper presentation and removal of the Speed table column remain in force.

## Scope

The Legacy Interfaces list at `/legacy/interfaces` gains:

- Debounced search without an Apply button.
- A filter-icon dropdown containing only multi-select device filtering.
- `All`, `Counting CRC`, and `State Changes` view tabs.
- `Delta` and `Current` counter-mode tabs, with Delta as the default.
- A conditional `7d`/`30d` window selector for Counting CRC and State Changes.
- Clickable sortable table headers.
- Default hostname-ascending order.
- Natural interface ordering, so `Ethernet1/2` sorts before `Ethernet1/10`.

The following behavior remains unchanged:

- Only currently present interfaces appear in list results.
- No longer present interfaces remain represented by the existing summary count.
- Raw interface state, speed, and sample data remain available in the detail drawer and history.
- The existing binary Admin/Oper list presentation remains unchanged.
- Pagination, summary cards, exact BigInt serialization, and authenticated page access remain in place.

## Toolbar and URL Behavior

The toolbar uses the same interaction pattern and visual language as ACI Interfaces:

1. A controlled search field updates the URL after a 300 ms debounce.
2. A filter-icon button opens a checkbox menu of devices. Multiple devices may be selected. The button shows the active filter count.
3. A segmented control selects `All`, `Counting CRC`, or `State Changes`.
4. A second segmented control selects `Delta` or `Current`.
5. When Counting CRC or State Changes is active, a `7d`/`30d` segmented control appears.

Every interaction uses `router.replace`, resets pagination to page 1, preserves the other active controls, and participates in the page's transition/loading state. There is no form submission or Apply button.

Canonical query parameters are:

- `query`: trimmed search text; omitted when blank.
- `device`: comma-separated device IDs; omitted when none are selected.
- `view`: `crc` or `state-changed`; omitted for `all`.
- `mode`: `current`; omitted for the default `delta` mode.
- `window`: `30d`; omitted for the default `7d` window and when the active view is `all`.
- `sort`: active table sort key; omitted for the default hostname sort.
- `dir`: omitted when it matches the active key's initial direction (ascending for text, descending for counters and Collected); otherwise set explicitly to `asc` or `desc`.
- Existing `page` and `pageSize` parameters continue to control pagination.

The removed `site`, `admin`, `oper`, and `presence` query parameters are ignored. Presence is fixed to `present: true` in the list query. The visible sort and direction selects are removed.

## Data Views

### All

Shows all currently present interfaces matching search and selected devices.

### Counting CRC

Shows only currently present interfaces with a positive sum of `dCrcErrors` during the selected 7d/30d window. Null reset deltas and non-positive deltas contribute zero and do not qualify an interface.

The CRC column header becomes `CRC (7d)` or `CRC (30d)` and displays the exact positive window total. Input and Output counters continue to follow the selected Delta/Current mode. The window total remains exact through BigInt arithmetic and crosses the server/client boundary as a decimal string.

### State Changes

Shows only currently present interfaces whose Admin or Oper state changed during the selected window. Comparison is case-sensitive to the stored raw state so any reported value transition is retained. A hidden latest sample before the cutoff serves as the baseline for the first visible sample, matching the ACI state-change behavior and preventing a transition at the start of the window from being missed.

Search and device filtering apply consistently to all views.

## Query and Data Flow

The server component parses the canonical URL state and builds a Prisma `where` constraint for search, selected device IDs, and `present: true`.

For Counting CRC, it queries positive `dCrcErrors` samples within the cutoff, sums them per interface, and intersects the base snapshot query with the qualifying interface IDs.

For State Changes, a focused PostgreSQL window query selects one pre-window baseline plus in-window samples per interface, uses `LAG` to compare consecutive Admin and Oper states, and returns the IDs with at least one in-window transition. The base snapshot query intersects with those IDs.

The server loads every matched current snapshot with its device identity and only its latest sample. A pure sorting helper then orders the complete matched set before the server slices the requested page. This mirrors the current ACI Interfaces approach and guarantees correct global natural ordering and counter sorting across pagination.

## Table Sorting

The following desktop headers are sortable:

- Device (hostname).
- Interface.
- Description.
- IP address.
- Admin.
- Operational.
- Input errors or delta.
- Output errors or delta.
- CRC errors, delta, or window total.
- Collected time.

The default sort is hostname ascending. Hostname ties use natural interface order, then ID as the final stable tie-breaker. Interface sorting uses an `Intl.Collator` with `numeric: true` and `sensitivity: 'base'`, producing `Ethernet1/1`, `Ethernet1/2`, `Ethernet1/10`.

Clicking an inactive text header starts ascending. Clicking an inactive counter or Collected header starts descending. Clicking the active header toggles direction. An arrow communicates the active direction. Counter sorting reads the latest raw values in Current mode and the latest delta values in Delta mode. Null values sort last in both directions. Counting CRC sorts its CRC header by the selected window total.

Changing Delta/Current preserves the active sort key and applies it to the newly selected counter family. Changing views preserves compatible sorts; the CRC key resolves to the active CRC representation.

## Component Boundaries

- `src/lib/legacy-ui/interfaces.ts` retains Prisma filter helpers and exact sample serialization.
- A focused pure sorting/view helper module under `src/app/(app)/legacy/interfaces/` owns URL parsing, natural ordering, counter-field selection, CRC aggregation, and stable sorting.
- A focused state-change query module owns the PostgreSQL window query and returns only interface IDs.
- The server page owns authenticated data loading, view-specific queries, sorting, and pagination.
- `LegacyInterfacesClient.tsx` owns toolbar interactions, immediate URL transitions, sortable header buttons, and list rendering.
- The drawer and history action remain independent and continue consuming raw stored values.

## Empty and Error States

- All: retain the existing no-interfaces guidance.
- Counting CRC: explain that no present interfaces have increasing CRC errors in the selected window.
- State Changes: explain that no present interfaces changed Admin or Oper state in the selected window.
- Missing latest samples display unavailable counter values as `—`.
- Null deltas display `—`; they are not coerced to zero.
- Database errors continue through the application's existing error boundary.

## Testing and Verification

Implementation follows test-driven development for pure and query behavior:

- URL parsing and canonical URL construction for search, multiple devices, views, mode, window, sorting, and pagination.
- Natural hostname/interface ordering and stable ID tie-breaks.
- Default hostname ascending behavior.
- Text-first ascending and counter/time-first descending sort transitions.
- Current/delta-aware BigInt counter sorting with nulls last.
- CRC window aggregation that excludes null, zero, and negative deltas.
- State-change SQL containing a pre-window baseline and detecting either Admin or Oper transitions.
- Existing filter, serialization, and state-normalization regression tests.

Final verification runs the focused tests during each red-green cycle, the full Bun test suite, ESLint for touched files, and the production Next.js build. Browser verification is optional because the local protected page requires an available database and authenticated session.
