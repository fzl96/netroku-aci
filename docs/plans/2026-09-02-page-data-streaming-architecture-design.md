# Page Data Streaming Architecture Design

## Goal

Make data-backed App Router navigation feel immediate while concentrating authorization, Prisma access, caching, mutations, and invalidation inside deep purpose modules. Route pages should remain synchronous framework adapters, render stable shells immediately, and stream independent visual regions behind shape-matched Suspense fallbacks.

## Scope

Migrate all data-backed application pages and session-only pages that currently perform direct reads. Leave the ACI workflow routes unchanged for now:

- `bridge-domains/**`
- `bridge-domains/epgs/**`
- `static-ports/**`
- `interface-selectors/**`

The first vertical slice is Endpoints. Subsequent slices apply the same conventions purpose by purpose rather than creating all query files, render modules, or skeletons in separate repository-wide phases.

## Route Adapter

Each migrated `page.tsx` remains synchronous. It owns static metadata and translates Next.js route props into a purpose-owned interface without awaiting request data.

For search-driven pages, the route adapter creates one derived promise by mapping `searchParams` through a pure purpose parser. All downstream render regions share that promise, so parsing occurs once and Next.js types do not leak into the render-module interface. Consuming `searchParams` still makes the route request-dependent; forwarding the unresolved promise keeps the stable shell and unrelated regions from blocking.

The route directory contains only framework-required files. Meaningful rendering implementation lives under `src/components/<purpose>/`.

## Render Modules and Streaming

Purpose render modules use kebab-case filenames under matching directories such as `src/components/endpoints/`. Exported React functions remain PascalCase.

Each page renders a stable shell immediately and introduces Suspense seams around meaningful visual regions rather than individual database calls. Regions stream independently only when their reads are genuinely independent. Prerequisite reads remain sequential.

The Endpoints slice uses this shape:

1. The page shell renders immediately.
2. Shared host resolution authenticates the viewer, validates the selected APIC, and preserves the current canonical redirect behavior.
3. The overview region renders counters, filter choices, and resync controls.
4. The results region renders the endpoint or port table and pagination.
5. Overview and Results stream independently after host resolution.

Do not add per-page `loading.tsx` files. Regional skeleton modules sit beside the render modules they represent and are reused by the matching Suspense fallbacks. Remove the existing Dashboard route-wide `loading.tsx` when Dashboard is migrated. A future `loading.tsx` requires evidence that the route shell itself cannot be synchronous.

## Purpose Modules

Data implementation is organized under `src/lib/<purpose>/`. Files are created only when the purpose earns them:

- `query.ts` for server-only durable reads, authorization, caching, Prisma orchestration, serialization, and safe purpose shapes.
- `mutation.ts` for server-only durable writes shared by entry adapters.
- `actions.ts` only when browser code directly invokes Server Actions.
- `params.ts` only when URL normalization is substantial.
- `export.ts` only for purposes that support export.

Manual and scheduled resyncs are mutations because they change durable database state. Existing POST resync routes remain transport adapters because they are long-running and expose meaningful HTTP status behavior. They call the deep purpose mutation implementation and no longer import Prisma.

Prisma is removed from every entry point touched by a purpose slice, including render modules, Server Actions, export routes, resync routes, and scheduler entry points. Existing lower-level APIC implementations remain behind their current internal seams when they already concentrate protocol and synchronization complexity.

## Authorization

Use a hybrid access model:

- Shared layouts perform optimistic session checks for navigation UX and shell presentation.
- Every server-only query securely verifies the current session and required role close to Prisma.
- Every mutation, Server Action, and route handler independently authorizes its caller.
- Request-scoped React caching deduplicates repeated session verification during one render pass.
- Persistent data caches never contain session objects or user-specific authorization decisions.

Page files do not perform direct session reads. User-specific values needed for rendering are resolved inside the relevant authenticated purpose module and returned as safe shapes.

## Cache and Invalidation

Retain the repository's current Next.js caching model instead of enabling Cache Components globally. Cache expensive Prisma reads with scoped `unstable_cache` entries.

Cached reads use an eight-hour safety lifetime and hierarchical tags:

- purpose-wide tags for global aggregation reads;
- host-specific tags for APIC-scoped pages;
- entity tags for detail views where targeted invalidation has leverage.

Successful writes expire affected tags immediately after the durable write commits. Manual and scheduled resyncs use the same invalidation implementation. Failed writes retain the last valid cached result. Partial resyncs invalidate only datasets that changed successfully.

Dashboard regions carry the tags of their underlying datasets. For example, an endpoint resync expires the affected host tag and the purpose-wide endpoint tag, invalidating the endpoint-dependent Dashboard region without evicting unrelated host caches.

## Directory and Naming Rules

- Framework files remain in `src/app/`.
- Purpose render modules live in `src/components/<purpose>/`.
- Shared render modules move to their nearest common purpose ancestor.
- A module shared by unrelated top-level purposes moves to `src/components/`.
- `src/components/ui/` remains reserved for shadcn modules.
- Non-framework filenames use kebab-case.
- Tests stay beside the modules they verify.
- Existing route and purpose names determine folder names.

Promotion requires real reuse. A render module used by multiple descendants of `/inventory` belongs under `components/inventory/`; a module used by both Endpoints and EPGs belongs under the root `components/` directory.

## Error Handling

Expected regional read failures render safe inline error states with a retry control that refreshes the current URL. Other regions remain usable, and filters and pagination remain intact. The server records diagnostic detail while the browser receives a non-sensitive message.

Unexpected failures continue to the route-level error handling. Mutation and route adapters preserve their current safe result or HTTP status contracts.

## Testing

Test through each deep purpose query interface rather than testing only extracted pure helpers. Coverage includes:

- authentication and role enforcement;
- URL normalization;
- filtering, pagination, and alternate views;
- Prisma orchestration and safe return shapes;
- cache keys, lifetimes, and tags;
- invalidation after successful and partial writes;
- regional skeleton structure;
- local error and retry behavior.

Keep useful existing pure behavior tests. Do not add a public database adapter solely for testing; use internal test seams or module substitution while preserving the production interface.

Each vertical slice follows red-green TDD, focused verification, full repository verification, and a review checkpoint before the next purpose begins.

## Migration Strategy

Start with Endpoints because it exercises direct Prisma removal, complex URL state, host selection, two views, pagination, filtering, manual resync, export, cache invalidation, Dashboard dependencies, and existing transition skeletons.

After Endpoints proves the conventions, migrate EPGs, Interface Health, Nodes, Dashboard, legacy data pages, inventory, and administrative purposes. History is aligned to the final convention during the sequence even though it already demonstrates a partial Suspense pattern.

The implementation plan must preserve a working repository after every purpose slice and remove obsolete entry paths rather than leaving duplicate seams.
