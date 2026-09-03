# EPG Server/Client Boundaries Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the plan task-by-task.

**Goal:** Refactor `/epgs` into a server-rendered shell with focused client islands and no Zustand or page-wide navigation context.

**Architecture:** `EpgShell` remains a Server Component that owns static page markup and Suspense boundaries. Server render modules fetch host/filter/results data; small Client Components own URL interactions, dialogs, table selection, and pagination. URL parameters remain the source of truth.

**Tech Stack:** Next.js 16 App Router, React 19 Server Components/Suspense, TypeScript, Prisma-backed EPG queries, Bun tests, Tailwind CSS.

---

### Task 1: Establish the shell and remove the page-wide client wrapper

**Files:**

- Modify: `src/components/epgs/epg-shell.tsx`
- Modify: `src/components/epgs/epgs-view.tsx`
- Test: `src/components/epgs/epgs-skeleton.test.tsx`

Steps:

1. Add a failing composition assertion for the shell's static title/description, header Suspense boundary, filter Suspense boundary, and results Suspense boundary.
2. Run the focused EPG skeleton/composition test and verify the new assertion fails because the shell is empty.
3. Implement `EpgShell` as a Server Component with the existing EPG page chrome, static toolbar slots, and shape-matched Suspense fallbacks.
4. Make `EpgsView` pass the shared parameter and host promises into `EpgShell` and remove its direct dependency on `EpgsClient`.
5. Run the focused test and verify it passes.

### Task 2: Extract header actions into their own client entry

**Files:**

- Create: `src/components/epgs/epg-header-actions-client.tsx`
- Modify: `src/components/epgs/epg-header-actions.tsx`
- Modify: `src/components/epgs/epgs-client.tsx`

Steps:

1. Add a source-level assertion that the server header module imports the dedicated client entry and that no production EPG module imports `EpgHeaderActionsClient` from the obsolete wrapper.
2. Run the focused test and verify it fails against the current import.
3. Move the header client implementation and its private dependencies out of `epgs-client.tsx` without changing its props or resync/export behavior.
4. Update the server header module to import the new client entry.
5. Run the focused test and verify it passes.

### Task 3: Split the static toolbar from data-backed filters

**Files:**

- Create: `src/components/epgs/epg-toolbar-client.tsx`
- Create: `src/components/epgs/epg-filters.tsx`
- Create: `src/components/epgs/epg-filters-client.tsx`
- Modify: `src/components/epgs/epg-shell.tsx`
- Modify: `src/components/epgs/epg-overview.tsx`
- Modify: `src/components/epgs/epgs-client.tsx`
- Modify: `src/components/search-bar.tsx` only if required to preserve the existing shared API

Steps:

1. Add focused tests for the toolbar/filter composition and no-host behavior.
2. Run them and verify the new boundary assertions fail.
3. Implement the client toolbar with static tabs and the shared `SearchBar`; tabs update URL parameters with `router.replace()` and local transition feedback where needed.
4. Implement the server filter region using the existing overview query, passing only filter choices and sync metadata to its Client Component.
5. Render the toolbar immediately and wrap only the server filter region in Suspense from `EpgShell`.
6. Preserve redirects, authorization errors, and the no-host empty state.
7. Run focused tests and verify they pass.

### Task 4: Split results table, pagination, and detail interactions

**Files:**

- Create: `src/components/epgs/epg-results-client.tsx`
- Create: `src/components/epgs/epg-pagination-client.tsx`
- Modify: `src/components/epgs/epg-results.tsx`
- Modify: `src/components/epgs/epgs-client.tsx`
- Modify: `src/components/epgs/epg-shell.tsx`

Steps:

1. Add focused composition assertions that the server results module owns the query and the client result entry receives pagination metadata.
2. Run them and verify they fail against the old implementation.
3. Move table/detail-panel behavior into the dedicated client result entry.
4. Move pagination controls into a dedicated client component receiving rows-independent pagination metadata and URL params.
5. Keep `EpgResults` as the only results data fetch and pass its serialized result to the client components.
6. Wrap `EpgResults` in the shell's results Suspense boundary with the view-aware skeleton.
7. Run focused tests and verify they pass.

### Task 5: Delete obsolete EPG client code and document the final state

**Files:**

- Delete: `src/components/epgs/epgs-client.tsx`
- Modify: `docs/plans/2026-09-03-epg-server-client-boundaries.md`
- Modify: `docs/plans/2026-09-03-epg-server-client-boundaries-design.md` only if implementation deviates

Steps:

1. Search for imports/usages of `EpgsClient`, `NavigationContext`, `useNavigation`, and Zustand under the EPG route and add/update a failing obsolete-path assertion if needed.
2. Run the focused test and verify it fails while the old module remains.
3. Delete the obsolete wrapper and remove dead imports/helpers without changing the server query interfaces.
4. Run focused tests, then the full test suite, lint, TypeScript/build checks, and `git diff --check`.
5. Update the plan progress and record any deviations.

## Progress

- [x] Replaced the page-wide `EpgsClient` wrapper with the server-rendered `EpgShell`.
- [x] Kept APIC actions, filters, and results behind server render modules and Suspense boundaries.
- [x] Split static tabs/search, filter controls, results table, pagination, and detail panels into focused Client Components.
- [x] Removed `NavigationContext`, `useNavigation`, and the obsolete combined overview/client module.
- [x] Kept URL parameters as the source of truth and avoided adding Zustand.
- [x] Added `use-debounce` as a direct dependency for the user-created shared `SearchBar`.
- [x] Reused the sidebar's persistently cached APIC host read for EPG host resolution.
- [x] Verified focused EPG tests (37 passed), full tests (777 passed / 2 skipped), lint (0 errors), formatting, and production build.

## Deviations

- A small server-side host gate remains inside `EpgShell` so the existing no-host empty state and canonical host redirect behavior are preserved. The static title/description and toolbar render before that gate; the host gate has no visible fallback, while APIC actions, filters, and results stream independently with their own fallbacks.
