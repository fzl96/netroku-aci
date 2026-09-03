# EPG Promise Consumption Design

## Goal

Simplify the `/epgs` component tree by removing Server Components that only await data and forward it to an interactive Client Component. Start data loading in the static server shell, pass stable promises through the existing Suspense boundaries, and read those promises in Client Components with React `use()`.

## Architecture

`EpgShell` remains the Server Component and the owner of static page structure. It receives the parsed search-parameter promise, starts host resolution immediately, and derives two data promises:

- one shared overview promise for header actions and filters;
- one results promise containing the selected view's rows and pagination metadata.

Both dependent queries begin as soon as the selected host context is available. The overview and results queries do not await each other.

The internal `EpgBody` remains in `epg-shell.tsx`. It is not a pass-through data module: it owns the host redirect, no-host state, authorization fallback, and placement of the independent filter and results Suspense regions.

The `/epgs` route renders `EpgShell` directly. The thin `EpgsView` adapter is removed.

## Client Components

`epg-header-actions.tsx`, `epg-filters.tsx`, and `epg-results.tsx` become Client Components. Each receives a server-created promise and reads it with `use()` inside its existing Suspense region. Their current interaction behavior remains local:

- header actions retain APIC selection, resync, export, and `router.refresh()`;
- filters retain URL replacement and pending interaction state;
- results retain row selection, empty states, and detail panels.

The former `*-client.tsx` forwarding targets are folded into these files and deleted.

## Table and Pagination

Pagination is part of the table's results presentation and does not need a separate module. `epg-pagination-client.tsx` is removed, and its navigation logic moves into `epg-table.tsx`. The table interface receives the page parameters and complete result object, then renders both the rows and pagination controls.

Empty-result messaging and detail-panel state remain in `epg-results.tsx`.

## Loading and Error Handling

The header actions, filters, and results keep separate Suspense boundaries and shape-matched skeletons. No page-wide or whole-body Suspense boundary is introduced.

Promises are created on the server and reused rather than created during Client Component rendering. Their resolved values are serializable discriminated states:

- ready data;
- inactive data for redirect or no-host contexts;
- expected authorization failure.

Expected authorization failures continue to render the existing region-local error UI. Unexpected failures reject and propagate to Next.js route error handling. `EpgBody` remains the single owner of redirect and no-host behavior.

## Files

Remove:

- `src/components/epgs/epg-filters-client.tsx`
- `src/components/epgs/epg-header-actions-client.tsx`
- `src/components/epgs/epg-results-client.tsx`
- `src/components/epgs/epg-pagination-client.tsx`
- `src/components/epgs/epgs-view.tsx`
- `src/components/epgs/epg-table-client.tsx` after moving it to `epg-table.tsx`

Update:

- `src/app/(app)/epgs/page.tsx`
- `src/components/epgs/epg-shell.tsx`
- `src/components/epgs/epg-filters.tsx`
- `src/components/epgs/epg-header-actions.tsx`
- `src/components/epgs/epg-results.tsx`
- EPG architecture and rendering tests

## Verification

Tests will verify that the shell starts and shares the expected promises, each interactive region reads its promise with `use()`, the obsolete forwarding files are gone, table pagination behavior is preserved, and independent Suspense boundaries remain. The full test suite, lint, formatting check, and production build must pass.

## References

- [React `use`](https://react.dev/reference/react/use)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
