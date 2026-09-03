# EPG Server/Client Boundaries Design

## Goal

Refactor `/epgs` into a server-rendered shell with focused Client Components for browser interactions, while preserving URL-driven filtering, pagination, resync, export, and detail panels.

## Decisions

- `page.tsx`, `EpgsView`, and data render modules remain Server Components.
- `EpgShell` owns the static EPG title, description, layout, tabs, and shared search bar.
- APIC actions are rendered by the existing server data boundary and streamed through a matched Suspense fallback.
- Tabs and `SearchBar` are client islands because they respond to browser events and update the URL.
- Filter choices and sync metadata are fetched by a server component and passed as serializable data to a client filter menu. Only that data-dependent region is suspended.
- One server results query returns both rows and pagination metadata. Client table, pagination, and detail-panel components consume that result without additional fetching.
- URL search parameters are the source of truth for host, view, search, filters, and pagination. Server-fetched data is passed as props, not copied into client state.
- Zustand is not needed. `useTransition` remains local to the Client Components that initiate navigation.
- `router.replace()` updates the URL and causes the route's Server Components to render with new parameters. Resync invalidates EPG cache tags and then uses `router.refresh()` to render the current route again.
- When no APIC host exists, the data-dependent toolbar and results are replaced by the existing empty state.

## Target Composition

```text
page.tsx                         Server
└── EpgsView                     Server
    └── EpgShell                 Server
        ├── static title/header
        ├── Suspense → EpgHeaderActions
        ├── static tabs + SearchBar
        ├── Suspense → EpgFilters
        └── Suspense → EpgResults
            ├── EpgTableClient
            └── EpgPaginationClient
```

The page-wide `EpgsClient` and `NavigationContext` are removed. Existing client-only state such as open detail panels and dialog state remains local to the component that owns it.

## Testing

Preserve the existing query, cache, mutation, skeleton, and URL behavior tests. Add composition assertions for the shell's Suspense seams and the absence of the obsolete client wrapper/context. Run focused EPG tests, the full Bun test suite, lint, TypeScript/build verification, and `git diff --check`.
