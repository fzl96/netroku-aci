# Endpoint Cascading Filter Menu Design

## Goal
Replace the staged all-in-one endpoint filter popover with a cascading menu that exposes only one filter branch at a time.

## Chosen interaction
- Keep one filter-icon trigger beside search.
- Clicking the trigger opens a compact root menu listing only: VLAN, Node, Interface, and Status.
- Hovering a root-menu item opens a side submenu for that filter category.
- Each submenu contains checkbox items for that category's values.
- Checkbox selections apply immediately and keep using the page's URL-backed filter state.
- The trigger keeps an active-count badge based on the number of populated filter groups.
- Each submenu includes a lightweight category-level clear action when that category has active selections.

## Why this shape
This mirrors the user's requested interaction directly while reducing visual weight further than the previous stacked popover. The root menu becomes an index, and detailed values only appear when the user enters one branch. It also aligns with the repo's existing dropdown submenu primitives, so the behavior can be implemented with less custom machinery.

## Component shape
- Replace the current filter popover UI in `EndpointsClient` with `DropdownMenu` plus nested submenu primitives.
- Keep the existing `buildUrl` flow and direct router updates.
- Reuse the shared active-filter group count helper.
- Remove now-unneeded staged local filter state.

## Edge cases
- Empty categories should stay visible in the root menu but open a disabled/empty submenu state.
- Selecting both statuses should continue to result in no status URL constraint, preserving current behavior.
- Clearing a category should only remove that category, not all active filters.
- Keyboard users should still be able to navigate the menu and submenus through the underlying dropdown primitives.

## Testing notes
- Keep the helper unit test for active group count.
- Verify with lint/build plus manual interaction for hover-open, immediate apply, category clear, and URL persistence.
