# View Page Shell Refactor Design

## Goal

Apply the `/epgs` component architecture to the other 17 routes that still render a `*View` module. Remove page-wide Client Component wrappers and Server Components whose only job is to await data and forward it to a Client Component, while preserving meaningful server boundaries, independent streaming, caching, URL-driven state, and current behavior.

Workflow pages outside this existing `*View` family are not part of this refactor.

## Design Principles

Each route should have a Server Component shell that owns its static page structure and starts independent data work as early as possible. The route page renders that shell directly instead of passing through a `*View` alias.

Interactive regions receive stable server-created promises and read them with React `use()` inside their own Suspense boundaries. Promises must not be created during Client Component rendering. Queries that do not depend on one another start in parallel.

The refactor is pattern-based rather than mechanical:

- remove shallow modules that only rename, await, or forward values;
- retain Server Components that enforce authentication, redirect, call `notFound()`, map server errors, or render substantial server-only content;
- retain pure Server Components when a region does not require client interactivity;
- avoid moving server-renderable page structure into a Client Component merely to standardize filenames.

## Page Composition

Static page content such as titles, descriptions, tabs, search controls, and layout stays in each route's shell. Page-wide wrappers such as `EndpointsClient` and `InterfaceHealthFrame` are split into the smallest interactive controls that actually need client state or router APIs.

The shell starts the route's host, overview, filter, trend, results, or account promises and passes each promise only to the region that consumes it. Shared query results may use one promise when multiple regions intentionally consume the same payload, as `/epgs` does for overview-backed header actions and filters.

The existing URL remains the source of truth for search, filters, sorting, views, and pagination. Client controls continue to use router navigation directly; navigation functions and pending UI state are not placed in Zustand or React context.

## Suspense and Loading

Each independently useful asynchronous region keeps a separate Suspense boundary with a shape-matched skeleton. A shell or page body must not be wrapped in `Suspense` with a `null` fallback, because that hides static content and makes revisiting a cached route appear blank.

Where a server decision controls the entire route—such as authentication, host redirect, no-host handling, or `notFound()`—that decision remains above the affected content. Region-local authorization or expected data errors continue to render their existing local states. Unexpected errors propagate to Next.js route error handling.

## Results and Pagination

When a table query already returns pagination metadata, its results component owns both the table and pagination controls. A separate pagination file is removed when it exists only to receive the same result metadata and update the URL.

Existing table behavior must remain intact, including row selection, detail panels, empty states, export behavior, responsive layouts, and staggered row-entry animations.

## Route Groups

The implementation will proceed in three groups:

1. Operational pages: dashboard, endpoints, nodes, interface health, and history.
2. Administration and inventory: APIC hosts, scheduler, settings, users, devices list/detail/import, and racks.
3. Legacy pages: devices, endpoints, health, and interfaces.

For every route, the current source and tests determine which modules are genuinely shallow. A large server-rendered detail page or an authentication gate may simply be renamed to a shell and kept server-side; it will not be converted to a Client Component solely to match `/epgs`.

## File Naming and Deletion Rules

- Replace route-level `*View` names with `*Shell` when the module owns page composition.
- Remove route-level client wrappers after moving their local interaction state into focused Client Components.
- Fold `foo.tsx` and `foo-client.tsx` together only when `foo.tsx` merely fetches or awaits data and forwards it.
- Keep domain modules whose deletion would expose authentication, error, transformation, or composition details to unrelated callers.
- Update route imports, tests, architecture guards, and mocks together with each rename or deletion.

## Verification

Each route group receives targeted component and architecture tests before moving to the next group. Tests should verify promise ownership, `use()` consumption, Suspense isolation, URL navigation, error and empty states, and removal of obsolete wrappers.

After all groups are complete, run the full test suite, lint, formatting check, production build, and code-graph impact review. Browser smoke tests should cover representative operational, administration/inventory, and legacy routes when the local application is available.

## References

- [`/epgs` promise-consumption design](./2026-09-03-epg-use-promise-design.md)
- [React `use`](https://react.dev/reference/react/use)
- [Next.js Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
