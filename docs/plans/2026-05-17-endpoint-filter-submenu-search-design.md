# Endpoint Filter Submenu Search Design

## Goal
Add search only where the cascading endpoint filter menu is likely to need it: VLAN and Interface.

## Chosen interaction
- Keep the cascading root menu unchanged.
- Add a compact search input to the VLAN submenu.
- Add a compact search input to the Interface submenu.
- Keep Node and Status as plain lists with no search field.
- Filter submenu items locally as the user types.
- Preserve immediate-apply checkbox behavior and category-level clear actions.

## Why this shape
VLAN and Interface are the branches most likely to grow long enough to need wayfinding. Node and Status are usually short, so leaving them unadorned keeps the menu cleaner and faster to scan.

## Implementation notes
- Extend the reusable submenu component with an opt-in `searchable` flag.
- Hold local search state inside each submenu instance.
- Reset search when the submenu unmounts naturally; no shared global state is needed.
- Show a small empty state when no values match the current query.

## Testing notes
- Verify manually that VLAN and Interface render search inputs while Node and Status do not.
- Verify typed search filters visible values only within the open submenu.
- Keep existing test/build verification unchanged.
