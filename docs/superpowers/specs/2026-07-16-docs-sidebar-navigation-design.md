# Docs Sidebar Navigation Design

**Date:** 2026-07-16

## Goal

Improve only the `/docs` sidebar so it carries the Netroku ACI identity, offers a direct route into the application, exposes both documentation groups immediately, and presents a compact theme toggle that fits the sidebar footer.

## Design

Keep Fumadocs' standard `DocsLayout` and use its public configuration and slot APIs instead of replacing the sidebar. This preserves its responsive drawer, search, current-page state, keyboard behavior, and page-tree rendering.

The sidebar header will show the existing `/brand-icon.png` asset beside the app name `Netroku/aci`. The complete brand is a link to `/`. A `Dashboard` navigation item links to `/dashboard` and appears before the generated documentation tree.

The sidebar provider will use an initial open depth of one. Consequently, the top-level `User Guide` and `Admin & Setup` folders render expanded on first load while remaining independently collapsible.

The stock footer theme switcher will be replaced through the layout's theme-switch slot with a single icon button. It will show the moon in light mode and the sun in dark mode, toggle only between light and dark, include an accessible label and title, and use a compact bordered circular treatment with visible hover and keyboard-focus states. The control must not retain the current full-width empty footer bar.

## Components and Data Flow

- The `/docs` layout owns sidebar-only Fumadocs configuration.
- A small client theme-button component reads and updates the existing root `next-themes` provider.
- The existing `nextBinaryTheme` helper remains the single source of truth for toggling between the two supported themes.
- The Fumadocs page tree remains generated from `content/docs`; no documentation content or non-docs application sidebar changes are in scope.

## Verification

Automated tests will assert the sidebar configuration and custom theme-button behavior where practical. Existing theme helper tests remain in place. Verification also includes lint/type or production-build checks and browser inspection of `/docs` in both light and dark modes, including the brand link, dashboard link, initial folder expansion, footer appearance, and responsive behavior.
