# Legacy Frontend and Scope Switcher Design

**Date:** 2026-07-21
**Status:** Approved for implementation planning

## Objective

Add a sidebar scope switcher and real read-only legacy infrastructure pages to `netroku-aci`. The switcher lets users move between the existing Cisco ACI experience and the newly ingested legacy-device data without mixing their distinct data models.

The existing Dashboard, Documentation, History, Settings, Users, Logout, theme control, and sidebar footer remain shared and retain their current routes and behavior. This phase does not redesign the dashboard or add legacy workflows.

## Scope

This phase includes:

- A brand dropdown in the sidebar header with `Netroku ACI` and `Netroku Legacy` choices.
- Dedicated `/legacy/*` routes for Devices, Health, Interfaces, and Endpoints.
- Current-state tables plus access to retained health, interface, log, and endpoint history.
- Search, filters, sorting, pagination, empty states, mobile layouts, and detail drawers.
- Route-aware cross-navigation between ACI and Legacy infrastructure pages.
- A non-sensitive scope cookie so shared pages retain the selected navigation after reload.

This phase excludes:

- Changes to Dashboard, Documentation, History, Settings, Users, or authentication behavior.
- Any Legacy Workflows section or legacy configuration/deployment actions.
- SSH, collection, retry, or ingestion controls in the web application.
- Changes to existing ACI page queries, routes, filters, resync actions, or workflows.
- Editing or deleting legacy devices and collected data.
- New health scores or undocumented warning thresholds.

## Navigation Architecture

### Sidebar header

The existing brand header becomes a dropdown trigger. It retains the brand icon and displays the active label:

```text
Netroku ACI     v
```

or:

```text
Netroku Legacy  v
```

The dropdown contains two single-select choices, ACI and Legacy. It must be keyboard accessible, expose the current choice, and use the existing dropdown styling. The alternate scope is intentionally hidden until the brand trigger is opened, matching the approved brand-dropdown direction.

### Scope state

The active scope is determined in this order:

1. A pathname under `/legacy` always selects Legacy.
2. A known ACI-only infrastructure or workflow pathname always selects ACI.
3. Shared routes use the `netroku_scope` cookie when it contains `aci` or `legacy`.
4. The default is ACI.

The cookie contains only the scope string, has `SameSite=Lax`, and is not an authentication or authorization mechanism. Selecting an option updates the local client state and cookie before navigation.

### Navigation groups

ACI retains the existing navigation exactly:

```text
Infrastructure
  APIC Hosts
  Endpoints
  EPG
  Interfaces
  Nodes

Workflows
  Bridge Domains
  EPG
  Static Ports
  Interface Selectors
```

Legacy replaces those two scope-specific groups with:

```text
Infrastructure
  Devices
  Health
  Interfaces
  Endpoints
```

Legacy does not render a Workflows group.

Shared navigation before and after these groups is unchanged:

```text
Dashboard
Documentation

System
  History
  Settings
  Users (admin only)
  Logout
```

### Cross-navigation

Switching scope on a shared route keeps the user on that route and only changes the scope-specific sidebar groups. On a mode-specific route, the switcher navigates using these mappings:

| ACI route | Legacy route |
| --- | --- |
| `/endpoints` | `/legacy/endpoints` |
| `/interface-health` | `/legacy/interfaces` |
| `/nodes` | `/legacy/devices` |
| `/apic-hosts` | `/legacy/devices` |

Other ACI infrastructure/workflow routes fall back to `/legacy/devices`. Legacy Health has no direct ACI equivalent and falls back to `/apic-hosts` when switching to ACI. Legacy sub-routes map through their owning list route before applying the table above.

## Legacy Routes and Pages

All routes live within the existing authenticated application layout.

### `/legacy/devices`

Purpose: browse the current device inventory automatically registered by ingestion.

Summary values:

- Total devices.
- Distinct sites.
- Devices with at least one health sample.
- Devices missing one or more feature collections.

Table fields:

- Hostname.
- Site.
- Management IP.
- Device type/vendor.
- Model.
- Serial number.
- Software version.
- Location.
- Last seen.
- Last successful Health, Interfaces, and Endpoints collection times.

The page supports free-text search across identity and inventory fields, site and device-type filters, sortable columns, and pagination. Selecting a row opens a detail drawer containing complete inventory metadata, first/last seen times, and feature freshness. It does not offer edit or collection actions.

### `/legacy/health`

Purpose: present the latest device health while allowing inspection of retained samples and logs.

The list shows one latest sample per device with:

- Device and site.
- Uptime.
- CPU, memory, and storage percentages.
- Temperature.
- Fan and PSU statuses.
- Collected time.

The list supports device/site search and filtering, sorting, and pagination. No inferred health score is displayed. Missing measurements remain visibly unavailable instead of being converted to zero.

Selecting a device opens a detail drawer with:

- `24h`, `7d`, `30d`, and `all` ranges.
- CPU, memory, storage, and temperature trend charts.
- A paginated sample-history table.
- A paginated log table with event/collection time, severity, message, and raw text detail.

Charts use a bounded, chronologically ordered series to remain responsive. The paginated tables remain the authoritative path to every retained sample or log in the selected range.

### `/legacy/interfaces`

Purpose: browse latest physical-interface state and inspect append-only counter/state samples.

Current table fields:

- Device and site.
- Interface name and description.
- IP/prefix.
- MTU and speed.
- Admin and operational state.
- Present/absent state.
- Latest raw input, output, and CRC counters.
- Latest input, output, and CRC deltas.
- Last seen/sample time.

The page supports search, device/site filters, admin/oper/presence filters, sorting, counter display mode, and pagination. Selecting an interface opens a detail drawer with `24h`, `7d`, `30d`, and `all` ranges, counter/delta trends, state samples, and a paginated complete history table.

Prisma `BigInt` values must be serialized as decimal strings before crossing a server/client boundary. Display formatting may add separators but must not coerce values through unsafe JavaScript numbers.

### `/legacy/endpoints`

Purpose: browse current endpoint presence and retained placement history.

Table fields:

- Device and site.
- MAC and nullable IP.
- VLAN and VLAN name.
- Interface.
- Learning type.
- Active/historical status.
- First seen.
- Last seen.
- Cleared time.

The page supports active/historical/all views, search across endpoint and device fields, device/site/VLAN/interface filters, sorting, and pagination. Placement movements appear as historical cleared rows plus the current active row; the UI does not merge or delete lifecycle records.

## Data Access and Component Boundaries

Each page is a server component responsible for session-protected initial queries and URL parameter parsing. Query-building, range parsing, serialization, and sorting helpers live outside React components and are unit tested.

Client components own interactive controls, URL transitions, responsive tables/cards, and drawers. Drawer history data is loaded through authenticated server actions following the existing interface-history pattern. Server actions validate IDs and range/page inputs before querying.

Reusable legacy-only primitives may cover:

- Page-size parsing and pagination.
- Search/filter URL updates.
- Device/site identity display.
- Collection freshness formatting.
- Missing-value and status badges.
- History range selection.

ACI components are reused only when their public visual contract fits without adding legacy branches. Existing ACI query and client components are not generalized as part of this work.

## Query and Performance Rules

- Search, filters, sorting, and pagination run in PostgreSQL wherever Prisma supports them.
- List pages never load full unbounded history collections.
- Latest health/interface samples are loaded with bounded relation queries or grouped latest-record queries, avoiding a query per row.
- History actions enforce positive page sizes and maximum chart point counts.
- `all` means no time cutoff, not an unbounded response; its table remains paginated and its chart remains bounded.
- Dates cross client boundaries as ISO strings.
- BigInt counters cross client boundaries as decimal strings.
- Empty datasets do not trigger per-row follow-up queries.

## Empty, Missing, and Error States

- No devices: explain that any successful `legacy_sync.py` mode registers devices, while `monitor` or `all` provides the complete inventory and health metadata.
- No health/interfaces for an existing device: show `Never collected`, not a healthy/zero value.
- No endpoints: explain that `legacy_sync.py endpoint` or `all` populates endpoint data.
- Absent interfaces and historical endpoints remain visible when their corresponding filters include historical data.
- A failed drawer request displays an inline retryable error without replacing data from another selected row.
- Pages expose database failures through the application's existing error boundary and never substitute fabricated values.
- No page exposes credentials, bearer tokens, raw ingestion payloads, or receipt hashes.

## Accessibility and Responsive Behavior

- The brand dropdown has an accessible name, current selection semantics, keyboard navigation, visible focus, and a sufficiently large pointer target.
- Tables retain semantic headers and accessible control labels.
- Desktop tables become compact mobile cards or horizontally bounded layouts following the existing application patterns.
- Drawers remain usable on narrow screens and trap/restore focus through the existing drawer primitives.
- Light and dark themes use existing design tokens.
- Status is never conveyed by color alone.

## Testing Strategy

### Navigation tests

- Route-to-scope resolution for Legacy, ACI-only, shared, and unknown paths.
- Exact prefix matching so `/legacy-internal` is not treated as Legacy.
- Cookie fallback/default behavior.
- Every cross-navigation mapping and fallback.
- Role filtering for shared Users navigation remains unchanged.
- Legacy renders no Workflows group; ACI retains all existing entries.

### Query/helper tests

- Search/filter composition for each page.
- Supported sort keys and deterministic fallback ordering.
- Page/page-size and history-range validation.
- Latest-sample selection without N+1 behavior.
- BigInt/date serialization.
- Active/historical endpoint lifecycle filtering.
- Missing latest samples and empty results.

### Component and browser verification

- Brand dropdown label, selection, focus, keyboard behavior, and navigation.
- Shared-route scope retention after reload.
- Populated and empty states for all four pages.
- Search, filtering, sorting, pagination, and drawer race/error behavior.
- Desktop and mobile layouts in light and dark themes.
- ACI routes and navigation remain behaviorally unchanged.

## Acceptance Criteria

1. The sidebar brand dropdown switches between ACI and Legacy scopes.
2. ACI Infrastructure and Workflows remain unchanged.
3. Legacy shows Devices, Health, Interfaces, and Endpoints and no Workflows group.
4. Shared links and pages remain unchanged and remember the selected sidebar scope.
5. Cross-navigation follows the documented mappings and fallbacks.
6. Each `/legacy/*` page reads real dedicated legacy tables and supports its documented list behavior.
7. Health/interface drawers expose range-filtered trends and pageable full history.
8. Endpoints expose active and historical placement rows.
9. The UI performs no SSH or collector orchestration and exposes no collection credentials.
10. Automated tests, production build, and desktop/mobile browser verification pass without regressing ACI behavior.
