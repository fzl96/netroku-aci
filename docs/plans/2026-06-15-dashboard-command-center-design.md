# Dashboard Command Center Design

## Goal
Redesign `/dashboard` into the first page operators can use to understand the
global Cisco ACI estate at a glance. The page should summarize endpoints,
interfaces, active faults, health scores, nodes, and hardware across all APIC
hosts, with the most urgent operational signals visible in the first viewport.

## Chosen shape
Use an **Operations Command Center** layout. The dashboard is a global overview,
not a selected-host page. It should answer: "is the fabric healthy right now,
what needs attention, and where should I click next?"

## Layout
Keep the existing app shell and sticky page header, but make the body more
purposeful:

- A top posture band with the overall fabric health, fault pressure, node
  availability, hardware failures, active endpoints, and interface error
  signals.
- A compact metric grid for Endpoints, Interfaces, Faults, Health Scores, and
  Nodes & Hardware.
- A lower "Attention required" section that ranks actionable risks by severity.
- A compact APIC host coverage table showing host-level freshness and key
  summary values.
- Clear links into `/faults`, `/health-scores`, `/interface-health`,
  `/endpoints`, and `/nodes`.

## Data flow
The page remains a server component and reads from Prisma. A dashboard-specific
summary helper can live next to the page or in `src/actions/dashboard.ts` if the
logic grows. It should aggregate:

- `ApicHost` sync timestamps for freshness.
- `Endpoint` active/historical counts plus distinct VLAN, node, and interface
  coverage.
- `InterfaceSnapshot` and latest `InterfaceSample` rows for interface totals,
  oper/admin down counts, and recent error/discard deltas.
- `FaultSnapshot` active counts by severity.
- `HealthScoreSnapshot` fabric score, worst node/tenant score, and degraded
  object count.
- `NodeSnapshot` online/total counts by role.
- `HardwareComponent` failed PSU/fan counts.

## Visual direction
Use a modern operational dashboard style: quiet surfaces, strong hierarchy,
compact metrics, restrained borders, and status colors only where they carry
meaning. Avoid a marketing hero and avoid nested decorative cards. The first
screen should feel dense but organized.

## Edge cases
When no hosts or no synced data exist, show neutral zero/empty states and links
to the relevant setup or detail pages. Unknown scores and sync timestamps should
render as `-` or `Never synced`, not as alarming failures. Interface risk should
only count samples with latest deltas available.

## Testing
Prefer small pure helpers for classifying posture, formatting freshness, and
building attention items, with focused tests. Verify the page with lint/build
after wiring Prisma aggregation into the server component.
