# History Server Query Design

## Goal

Make History pagination, search, and action filtering operate on the complete
`AuditLog` table through URL query parameters instead of filtering a fixed
client-side set of 200 records.

## URL Contract

The History route accepts these optional parameters:

- `query`: trimmed free-text search.
- `action`: an exact supported audit action.
- `page`: a positive integer, defaulting to `1`.

Empty/default values are omitted from generated URLs. Changing `query` or
`action` resets `page` to `1`. Pagination preserves the active query and action.
Invalid actions are treated as no action filter, and invalid pages fall back to
page `1`.

## Server Data Flow

`HistoryPage` authenticates the request, parses `searchParams`, and renders the
stable page shell and controls. A dedicated async `HistoryResults` server
component asks the audit action layer for one 20-row page. The database query:

- searches `userName`, `target`, and `detail` case-insensitively;
- also matches known human-readable action labels by translating label matches
  into exact action values;
- applies an exact action filter when supplied;
- orders by `createdAt` descending;
- runs the page query and matching count together.

The requested page is clamped against the matching result count. If it is above
the last page, the page query uses the last valid page so the UI never renders
an empty phantom page.

## Suspense and Loading State

`HistoryResults` is wrapped in a `Suspense` boundary keyed by the parsed
`query`, `action`, and `page`. Its fallback is a History-specific skeleton that
matches the count, table header, table rows, and pagination footprint.

The page heading and search/action controls remain outside the boundary. They
stay mounted and usable while a URL update triggers a fresh server query; only
the results region changes to the skeleton. This prevents layout shift and
keeps the locally controlled search input from disappearing during its
debounced navigation.

## Client Interaction

The controls client receives the parsed query and action. The results client
receives only the current rows, total count, and effective page.

The search input keeps immediate local state, so typing is never debounced or
visually delayed. A short debounce applies only to `router.replace`, which
updates the `query` URL parameter and resets `page`. The input resynchronizes
from server props without overwriting newer in-flight typing.

The action select and pagination controls update the URL immediately. Navigation
is shown as pending through React transition state. Existing payload expansion
and CSV export behavior remain local to the current page.

## Error and Edge-Case Handling

- Database errors continue through the existing Next.js error handling.
- Nullable searchable columns are safe under Prisma's string filters.
- Zero matches render the existing empty state and report zero entries.
- Browser back/forward navigation restores query, action, page, and the visible
  search input.
- Audit records are not deleted or capped by this feature.

## Testing

Unit tests cover query parsing, action-label search expansion, combined
search/action filters, page fallback, and page clamping. Existing history export
tests remain unchanged. Verification also checks that the Suspense fallback
matches the results region without replacing the search controls. The
implementation is verified with focused tests, the full test suite, lint, and a
production build.
