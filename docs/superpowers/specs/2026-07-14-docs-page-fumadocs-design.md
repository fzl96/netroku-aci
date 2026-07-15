# Documentation Page (`/docs`) with Fumadocs — Design

**Date:** 2026-07-14
**Status:** Approved
**Scope:** First pass — working scaffold + stub content

## Goal

Add a public documentation site at `/docs` inside the existing Next.js app,
covering both an end-user guide and admin/setup material. This first pass wires
up Fumadocs with a working navigation and stub MDX pages; real content is filled
in later.

## Decisions

- **Tool:** Fumadocs with the Fumadocs MDX content source. Chosen for native
  Next.js App Router integration, Tailwind v4 support, git-versioned MDX, and the
  ability to live inside this app rather than as a separate site.
- **Access:** Public. No authentication — anyone can read `/docs`.
- **Audience:** Both end users (dashboard usage) and admins (deployment/setup).
- **Content location:** Root-level `content/docs/` (Fumadocs default).
- **Content depth this pass:** Scaffold + stubs. Every page is a real MDX file
  with frontmatter, a short intro, and `## TODO` headings, wired into the nav.

## Architecture

### Route placement

The docs route lives at `src/app/docs/`, **outside** the `(app)` route group.
The `(app)` layout enforces auth via `getSession()` and renders `AppSidebar`;
placing docs outside it means docs inherit only the public root layout
(`ThemeProvider` + fonts), so they are public by construction. Fumadocs supplies
its own docs sidebar and nav.

```
netroku-aci/
  content/
    docs/
      index.mdx                 # /docs landing
      meta.json                 # top-level order: [user-guide, admin]
      user-guide/
        meta.json               # title "User Guide" + page order
        index.mdx               # overview (stub)
        dashboard.mdx           # stub
        endpoints.mdx           # stub
        epgs.mdx                # stub
        faults.mdx              # stub
        health-scores.mdx       # stub
        interface-health.mdx    # stub
      admin/
        meta.json               # title "Admin & Setup" + page order
        index.mdx               # overview (stub)
        deployment.mdx          # stub
        apic-hosts.mdx          # stub
        scheduled-resync.mdx    # stub
        users.mdx               # stub
  source.config.ts              # fumadocs-mdx config (repo root)
  src/
    lib/
      source.ts                 # Fumadocs loader / source adapter
    app/
      docs/
        layout.tsx              # DocsLayout — sidebar tree, public
        [[...slug]]/
          page.tsx              # renders one MDX page by slug
```

### Data flow

1. `source.config.ts` declares the `content/docs/` collection to `fumadocs-mdx`.
2. `fumadocs-mdx` generates a `.source/` index at build (via `createMDX()` in
   `next.config.ts`).
3. `src/lib/source.ts` loads that index with `loader()` and exposes a page tree.
4. `src/app/docs/layout.tsx` renders Fumadocs `DocsLayout` with the tree.
5. `src/app/docs/[[...slug]]/page.tsx` resolves the URL slug to a page and
   renders its MDX body; folder structure = URL structure.
6. `meta.json` files control per-folder sidebar titles and ordering (not
   alphabetical).

## Integration points (and risks)

1. **next.config.ts** — wrap the exported config with `createMDX()` from
   `fumadocs-mdx`. The existing `reactCompiler: true` option is preserved.
2. **Theme** — the root layout already provides a next-themes `ThemeProvider`.
   Fumadocs' `RootProvider` also bundles a theme provider, so disable it
   (`theme={{ enabled: false }}`) and let the existing provider drive dark/light,
   avoiding a duplicated provider.
3. **Tailwind v4 + styling (main risk)** — fumadocs-ui ships a v4 preset
   (`@import "fumadocs-ui/css/preset.css"`). The app's `globals.css` (shadcn
   tokens) is global, so Fumadocs' tokens could clash. Verification must confirm
   both `/docs` and the existing dashboard render correctly with no regression.

## Dependencies to add

- `fumadocs-ui`
- `fumadocs-core`
- `fumadocs-mdx`
- `@types/mdx` (dev, if needed for typing)

## Content (this pass)

- **User Guide** section: overview + one stub per major dashboard page
  (dashboard, endpoints, epgs, faults, health scores, interface health).
- **Admin & Setup** section: overview + deployment, APIC hosts config, scheduled
  resync, users.
- Each stub: frontmatter (`title`, `description`), a one-line intro, and `## TODO`
  headings marking sections to write later.

## Verification / testing

- `bun run build` completes with the MDX pipeline enabled.
- `/docs` loads without an auth redirect; sidebar shows both sections; a stub
  page renders.
- Existing `(app)` dashboard pages still render with no CSS regression
  (verified via the browser preview tool).

## Out of scope (this pass)

- Real written documentation content (later pass).
- Search integration (Fumadocs search can be added later).
- Versioned docs, i18n, or a CMS/remote content source.
- Auth-gating or app-themed integration (docs are intentionally public/standalone
  within the app shell).
