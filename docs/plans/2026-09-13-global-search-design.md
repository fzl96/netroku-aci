# Global search design

Status: approved and implemented. The PostgreSQL index migration is ready; the configured database was unavailable during implementation, so it has not been applied there.

## Agreed behavior

- Search application pages, individual records, and documentation articles.
- Results only navigate; they do not execute operational commands.
- Provide a visible search bar in the sidebar, Ctrl/Cmd+K, and a mobile search icon.
- Support arrow-key selection, Enter to navigate, and Escape to close.
- Initial record coverage: ACI endpoints, EPGs and nodes; Legacy devices and endpoints; inventory sites, racks and devices.
- Match identifiers such as IP, MAC, hostname and serial number alongside names where applicable.
- Search all sources the user can access, regardless of the current ACI/Legacy mode or selected APIC.
- Label source context clearly and navigate results into the correct source context.
- Show current endpoint placements by default, with an explicit option to include historical ACI and Legacy endpoint placements. Label this coverage clearly. Historical nodes and other entity histories are outside the first version.
- Show documentation matches in a separate group.
- Before typing, show accessible application pages grouped by area. Fetch record matches after typing. Recent-search history is outside the first version.
- Use case-insensitive partial matching for names and identifiers, normalize common MAC separators, and rank exact identifier matches first. Typo tolerance is outside the first version.
- Group results by type, with at most five matches per group. Show identifiers and source context; offer a View all link only where the destination supports equivalent filtering.
- Keep successful groups usable when another fails, with a retry message for the failed group. Distinguish empty results from failed searches.
- Use a compact centered dialog with grouped rows and keyboard hints, styled with the application's existing light/dark themes.
- Keep the existing documentation search and shortcut on documentation pages. The new global search belongs to the authenticated application shell.
- For individual records, open the existing destination with source/filter context and reveal/highlight the selected record, adding URL selection support where needed. Inventory devices use their existing detail route.
- Endpoint results are the exception to individual-record navigation: group matching placements by MAC within an APIC for ACI or a device for Legacy. Show the current or most recent matching placement and indicate additional matches. Navigate to the endpoint list filtered to that group, including historical placements when requested.
- Include all inventory device lifecycle statuses by default, displaying the status on each result. The endpoint history option does not affect inventory results.

## Existing implementation context

- The application has cmdk-based command dialog primitives.
- ACI and Legacy navigation modes share some pages.
- `/api/search` already serves public documentation search. Operational record search requires a separate authenticated boundary.

## Implementation

1. Share the existing navigation metadata between sidebar and search, preserving role visibility and source-aware destinations.
2. Add a global-search purpose module for protected record queries, normalization, ranking, grouping and safe destination construction. Keep Prisma and authorization behind its server-only interface, following the existing architecture.
3. Expose an authenticated operational search endpoint distinct from public `/api/search`. Reuse documentation search while preserving article/heading destinations.
4. Mount one dialog in the authenticated shell, reuse the existing command primitives, and connect sidebar/mobile triggers and the keyboard shortcut. Keep server-ranked record results from being filtered a second time by the command component.
5. Add destination selection support for individual results. Use stable domain identity where synchronization replaces database rows, notably APIC plus DN for EPGs. Ensure selection reveals the target despite pagination and handles records removed since search.
6. Verify access control, normalization, ranking/group limits, history semantics, partial failure, source-aware navigation, exact selection, keyboard operation and mobile/theme behavior with focused tests and UI checks.

## Review criteria

- The same IP or MAC in different sources remains distinguishable and opens the correct source.
- Repeated placements do not consume all five endpoint group slots.
- Historical endpoint links explicitly preserve historical inclusion; current-only links explicitly preserve active filtering.
- Inventory status is visible and independent of endpoint history.
- A record result reaches the intended record or endpoint group, rather than an unrelated broad list.
- A failing group does not hide successful matches, and stale query responses cannot replace newer results.
- Restricted pages and records are absent for unauthorized users, with protection enforced server-side for record reads.
- Documentation retains its own search outside the authenticated shell.

## Verified destination constraints

Only inventory devices currently have a dedicated record detail route among the selected types. Other results need filtered-list navigation or additional exact-selection support. Node lists exclude absent nodes even though the database retains them. ACI and Legacy endpoints retain historical placement records; EPG synchronization replaces snapshots and does not retain history. Inventory lifecycle statuses describe current records rather than historical versions.

No separate ADR is needed for the decisions so far: the design reuses existing application boundaries and does not introduce a new durable search index or service.

## Search backend and rollout

- Application pages use the shared navigation registry in `src/lib/navigation.tsx`; the dialog filters them locally and respects administrator-only visibility.
- Operational records use the authenticated `/api/global-search` endpoint and `src/lib/global-search/query.ts`. All selected record types follow the existing session-readable access model. The response is private and uncached.
- PostgreSQL performs ranking and endpoint grouping before limiting each type to five results. The migration adds `pg_trgm` expression indexes matching the catalog's searchable fields, plus normalized MAC indexes. There is no separate search service or synchronized search document table.
- Record requests start after three characters and a 200 ms debounce. Each group has a two-second PostgreSQL statement timeout, and errors remain isolated to their group. Old browser requests are aborted and stale responses are ignored.
- Exact destinations use APIC plus EPG DN, node/device IDs, site/rack IDs, or a MAC identity filter within the endpoint's APIC/device. Exact endpoint filters recognize collector MAC spellings. Filtered endpoint and EPG exports preserve these selections.
- Documentation results reuse public `/api/search`, deduplicate articles, preserve heading URLs, and render highlighted snippets as plain text.
- Existing record lists do not reproduce the global search's combination of fields, source scope and ranking. The palette therefore does not emit broad View all links that would change those semantics. Exact selection pages provide Show all to clear their selection.

Apply the migration with `bun run prisma:deploy` when the intended PostgreSQL database is reachable. The deployment Compose migration service already runs this command before starting the application. PostgreSQL must provide `pg_trgm`, and the migration role must be able to create the extension and indexes. Index creation is a normal migration operation and should be scheduled with the application's usual database rollout; on large existing tables it can block writes while building.

The index plan was checked in isolated PostgreSQL (PGlite), not against the deployment's data volume or concurrency. Validate representative query latency there before claiming a production latency target or deciding whether to introduce a separate search engine.

## Verification

- Production build passed, including Next.js TypeScript validation.
- ESLint passed for changed TypeScript/TSX files; `git diff --check` passed.
- New SQL integration tests apply all project migrations to isolated PGlite with `pg_trgm`, then exercise every record provider, ranking, MAC normalization, historical grouping, literal wildcard handling, inventory statuses and index availability.
- Authorization tests verify authentication before reads, safe response fields, request validation, bounded queries and partial failure behavior. Destination tests cover exact identity, source context, cache separation and lifecycle URL round trips.
- Chromium interaction checks against the actual search components with mocked router/API boundaries passed for desktop/mobile triggers, focus, Ctrl/Cmd+K, arrows/Enter/Escape, navigation URLs, documentation merging, partial failures, history toggling, short/empty queries and stale responses. These are component interaction checks, not a live authenticated database end-to-end run.
- Full suite: 941 passed, 15 skipped, one existing failure in `src/components/epgs/epgs-skeleton.test.tsx` (the unchanged test rejects any Suspense inside the unchanged EPG main element, which already contains a regional filter boundary).
