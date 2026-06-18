# Endpoint Filter Popover Design

## Goal
Replace the four always-visible endpoint filter buttons with one compact filter control that keeps the toolbar calm while making multi-filter edits easier.

## Chosen interaction
- Keep the existing search field visible in the toolbar.
- Replace the visible VLAN, Node, Interface, and Status buttons with one filter-icon button.
- Clicking the button opens a compact popover containing all four filter groups.
- While the popover is open, filter changes are staged locally rather than applied immediately.
- `Apply` commits all staged selections together and closes the popover.
- `Clear` resets all staged selections so the user can remove every filter in one action.
- The trigger button should visibly indicate when filters are active, ideally with a small count badge.

## Why this shape
The page already stores filter state in URL params, which is a good backbone and should remain intact. A single popover removes repetitive chrome from the toolbar, while deferred apply prevents the table from reloading four times when a user is composing a compound filter. It keeps the interaction compact without prematurely introducing a heavier sheet or dialog pattern.

## Component shape
- Reuse the existing per-filter option sources: VLANs, nodes, interfaces, and statuses.
- Introduce a single composite filter popover in `EndpointsClient`.
- Keep the existing URL-building and router replacement flow; only the timing changes from per-selection updates to one explicit apply action.
- Preserve disabled/loading behavior during pending navigation.

## Edge cases
- Opening the popover should initialize staged state from the currently applied filters.
- Closing without applying should leave the current page filters unchanged.
- If options are unavailable, their section should remain visibly disabled rather than disappearing.
- Active filter count should reflect the number of filter groups with at least one selection, not the raw number of selected values.

## Testing notes
- Because the project currently has no UI test harness, verify behavior through lint/build plus manual interaction.
- The riskiest behavior to inspect manually is synchronization between applied URL state and staged popover state after Apply, Clear, and reopen.
