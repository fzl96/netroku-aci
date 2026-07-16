# Endpoint table sorting design

## Scope

Add client-side, click-to-sort behavior to the Endpoints page in both **By Endpoint** and **By Port** views. Sorting applies to the currently loaded page of results and is shared by the desktop table and mobile card list.

## Interaction

- Each visible table column header is a button.
- Selecting a new column sorts ascending first; selecting the active column toggles between ascending and descending.
- The active header exposes its direction through an icon and an accessible label.
- Until a header is selected, the existing server-provided order is retained.
- Changing the view starts with that view's default order; sorting is not encoded in the URL and does not alter pagination, filters, or exports.

## Data and ordering

- Endpoint view supports sorting MAC, IP, VLAN, node, interface, EPG description, first seen, last seen, and status.
- Port view supports sorting node, interface, endpoint count, VLAN list, EPG description, and last seen.
- Text uses natural, case-insensitive ordering. Dates sort chronologically. Numeric counts sort numerically. Endpoint status sorts active before historical in ascending order.
- Missing values sort after populated values in ascending order and before them in descending order.
- Sorting copies input arrays and uses the pre-existing order as a stable tie-breaker.

## Implementation boundaries

- Keep sorting helpers next to the Endpoints page, with focused unit tests for the comparison behavior.
- `EndpointsClient` owns the transient sort state and derives sorted arrays before rendering both layouts.
- The server page and Prisma queries remain unchanged; their current default ordering continues to supply the initial result order.

## Validation

- Unit tests cover direction toggling and representative text, date, count, status, and missing-value ordering for both views.
- Run the focused test file, the full Bun test suite, lint, and a production build.
