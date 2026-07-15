# Mobile UI/UX Improvements — Monitoring Surfaces

**Date:** 2026-07-15
**Status:** Approved (design)

## Problem

Netroku ACI is a dense, table-heavy Cisco ACI operations dashboard built on
Next.js + shadcn/ui. It is effectively unusable on a phone:

- **Navigation is unreachable.** The layout renders `<AppSidebar>` (a shadcn
  `Sidebar` that already ships a mobile `Sheet` opening at `<768px`), but
  `SidebarTrigger` is rendered *nowhere* in the app. On a phone there is no
  hamburger and no way to open the nav.
- **Page chrome is desktop-fixed.** Every list page has a sticky header with
  hardcoded `px-8 h-16` containing a title block, an APIC host `<select>`, and a
  Resync button that collide on narrow screens.
- **Tables overflow.** Data tables (Faults, Interface Health, Endpoints, Nodes,
  Health Scores) render wide `<table>` markup that is unreadable on mobile.
- **Toolbars don't wrap.** Search + filter dropdowns + pagination sit in a
  single non-wrapping flex row.

## Goal & Use Case

Optimize for **field monitoring (read)**: an engineer on-site at a rack checking
status/faults/interfaces on a phone. Prioritize fast, readable data on small
screens. Deploy/rollback **workflows and admin are out of scope** for this spec
(deferred to follow-up specs).

## Approach

**Foundation-first, then convert priority read pages.** Build two shared pieces
once — (1) a mobile top bar carrying the sidebar trigger, and (2) a reusable
table→card primitive — then convert the high-value read pages to card layouts.
Desktop rendering stays untouched; mobile work is isolated per page and
independently testable.

**Breakpoint:** `md` (768px), matching the existing `useIsMobile` hook and the
sidebar's own mobile threshold. "Mobile" = `<md`; "desktop" = `md+`.

## Scope

**In scope**
- Mobile top bar + nav trigger (global, in the app layout).
- Responsive page headers (padding + stacking of title/host-select/Resync).
- Reusable `DataCard` shell primitive.
- Convert to mobile card layouts: **Faults, Interface Health, Endpoints, Nodes,
  Health Scores**, plus a responsive **Dashboard**.
- Responsive toolbars (search / filters / pagination).
- Verify charts and existing `vaul` drawers render well on mobile.

**Out of scope (own specs later)**
- Deploy/rollback workflows (Bridge Domains, Static Ports, Interface Selectors).
- EPG / bridge-domain detail panels.
- Admin (Users, Settings), Docs.

## Design

### 1. Mobile shell (navigation)

Add one global mobile top bar in `src/app/(app)/layout.tsx`, rendered
`md:hidden`, sticky at the top of `<main>`:

```
[ ☰ SidebarTrigger ]  [ brand / page title ]  [ theme toggle ]
```

- `☰` is shadcn's `SidebarTrigger`, which already toggles the existing mobile
  `Sheet` via `useSidebar().toggleSidebar()`. This single addition makes the
  entire nav reachable on mobile.
- Because the trigger lives in the layout, no individual page needs to add one.
- The page title in the bar can be a simple brand label ("Netroku ACI") to
  avoid threading per-page titles through the server layout; each page already
  shows its own `<h1>` immediately below.

Each page's existing sticky header becomes responsive:
- `px-8` → `px-4 md:px-8`.
- Title block + host `<select>` + Resync stack/wrap on mobile: host `<select>`
  goes full-width, Resync collapses to icon + short label. Use `flex-col`
  →`md:flex-row`, `flex-wrap`, and width utilities rather than new components.

### 2. Responsive table → card list

Add a small shared primitive at `src/components/ui/data-card.tsx`:

- `DataCard` — a tappable card shell: a title/lead row (supports a badge slot),
  a set of label/value pairs, and optional trailing meta (e.g. relative time).
  Styled to match the existing card system (`bg-card border border-border
  rounded-2xl shadow-sm`, text scales from `ui-classes`).
- Composed of subparts (e.g. `DataCard`, `DataCardRow`) so each page maps its
  own fields; no generic auto-table introspection.

Each converted page renders **both** layouts from the same `rows` data:
- `hidden md:block` → the existing `<table>` (unchanged).
- `md:hidden` → a `<div className="space-y-2">` mapping rows to `DataCard`s,
  showing that page's 3–4 key fields.

Per-page key fields (initial proposal, refine during implementation):
- **Faults:** severity badge + code (lead), description, node/affected, relative
  created time, ack indicator.
- **Interface Health:** interface + node (lead), status badge, error/CRC
  counters, utilisation.
- **Endpoints:** MAC/IP (lead), node/interface, VLAN/EPG, active vs historical
  badge.
- **Nodes:** node name/id (lead), role, health score, status.
- **Health Scores:** entity (lead), score (prominent), category/trend.

### 3. Toolbars, filters & pagination

- Toolbar row → `flex-wrap` and stacks on mobile: search input full-width
  (`w-full md:w-56`), filter dropdowns in a wrapping/scrollable row with widened
  tap targets.
- Pagination collapses on mobile to `‹ prev · page x of y · next ›`. Per-page
  size selector and jump-to-page input are `hidden md:flex` (kept on desktop).
- Filter menus already use Radix dropdowns (touch-friendly); just enlarge hit
  areas.

### 4. Dashboard & charts

- Dashboard summary cards → single column on mobile: `grid-cols-1
  md:grid-cols-…`.
- Recharts trend charts (`FaultsTrendChart`, `InterfaceCrcTrendChart`,
  `NodesTrendChart`, `HealthTrendChart`) are already `ResponsiveContainer`-based;
  set a mobile-appropriate height and reduce X-axis tick density so labels don't
  crowd.
- `vaul` drawers (e.g. `InterfaceErrorTrendDrawer`) — verify they open
  full-width and are scrollable on mobile.

### 5. Rollout & verification

Order:
1. Foundation: mobile top bar + trigger, responsive page-header pattern,
   `DataCard` primitive, responsive toolbar/pagination pattern.
2. Convert pages: **Faults → Interface Health → Endpoints → Nodes → Health
   Scores → Dashboard.**

Each page is visually verified at **375px** width (preview tooling) before
moving to the next. Existing `sort.ts` / `sort.test.ts` logic is untouched, so
no unit-test regressions are expected; run `bun test` after the foundation and
after all conversions.

## Non-Goals / Constraints

- No change to desktop layouts or behavior.
- No new heavy dependencies; reuse shadcn/ui, `vaul`, `recharts`, `ui-classes`,
  and `use-mobile` already in the project.
- No generic table abstraction — per-page card layouts over a shared shell.
