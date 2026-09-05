# Docs Sidebar Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add branded home navigation, a dashboard link, initially expanded documentation groups, and a compact single-button theme toggle to the `/docs` sidebar.

**Architecture:** Keep Fumadocs' `DocsLayout` and centralize its sidebar-facing props in a small typed options module. Use the existing root `next-themes` provider and `nextBinaryTheme()` helper from a focused client component rendered as the sidebar footer, while disabling the stock Fumadocs theme switch so its empty full-width control bar disappears.

**Tech Stack:** Next.js 16, React 19, TypeScript, Fumadocs UI 16, next-themes, Tabler Icons, Tailwind CSS 4, Bun test.

## Global Constraints

- Scope changes to the `/docs` layout and docs-specific components only.
- Reuse `/brand-icon.png` and display the app name as `Netroku/aci`.
- The brand links to `/`; the dashboard item links to `/dashboard`.
- `User Guide` and `Admin & Setup` are open initially but remain collapsible.
- The theme control is one accessible icon button that toggles only light and dark.
- Preserve Fumadocs search, responsive navigation, active states, and page-tree rendering.

---

### Task 1: Define and test the docs layout options

**Files:**

- Create: `src/app/docs/layout-options.test.tsx`
- Create: `src/app/docs/layout-options.tsx`
- Modify: `src/app/docs/layout.tsx`

**Interfaces:**

- Consumes: `DocsLayoutProps` from `fumadocs-ui/layouts/docs` and the existing `source.getPageTree()`.
- Produces: `docsLayoutOptions: Omit<DocsLayoutProps, "tree" | "children">` with home navigation, dashboard link, sidebar open depth, custom footer, and stock theme-switch disabling.

- [ ] **Step 1: Write the failing options test**

```tsx
import { describe, expect, test } from "bun:test";
import { isValidElement } from "react";
import { docsLayoutOptions } from "./layout-options";

describe("docsLayoutOptions", () => {
  test("configures docs navigation and initially opens top-level folders", () => {
    expect(docsLayoutOptions.nav?.url).toBe("/");
    expect(docsLayoutOptions.links?.[0]).toMatchObject({
      type: "main",
      text: "Dashboard",
      url: "/dashboard",
    });
    expect(docsLayoutOptions.sidebar?.defaultOpenLevel).toBe(1);
  });

  test("replaces the stock theme switch with a custom sidebar footer", () => {
    expect(docsLayoutOptions.themeSwitch?.enabled).toBe(false);
    expect(isValidElement(docsLayoutOptions.sidebar?.footer)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify the missing module failure**

Run: `bun test src/app/docs/layout-options.test.tsx`

Expected: FAIL because `./layout-options` does not exist.

- [ ] **Step 3: Add the typed options and consume them from the docs layout**

Create `src/app/docs/layout-options.tsx` with a `DocsBrand` element using `next/image`, the `Dashboard` link with `IconLayoutDashboard`, `sidebar.defaultOpenLevel: 1`, a `DocsThemeToggle` footer, and `themeSwitch.enabled: false`. Export the object as:

```tsx
export const docsLayoutOptions = {
  nav: { title: <DocsBrand />, url: "/" },
  links: [
    {
      type: "main",
      text: "Dashboard",
      url: "/dashboard",
      icon: <IconLayoutDashboard aria-hidden />,
    },
  ],
  sidebar: {
    defaultOpenLevel: 1,
    footer: <DocsThemeToggle />,
  },
  themeSwitch: { enabled: false },
} satisfies Omit<DocsLayoutProps, "tree" | "children">;
```

Spread `docsLayoutOptions` onto `DocsLayout` before `tree` in `src/app/docs/layout.tsx` so the tested object is the runtime configuration.

- [ ] **Step 4: Run the focused test**

Run: `bun test src/app/docs/layout-options.test.tsx`

Expected: PASS with 2 tests.

### Task 2: Build the docs brand and compact theme button

**Files:**

- Create: `src/components/docs/DocsThemeToggle.tsx`
- Complete: `src/app/docs/layout-options.tsx`
- Test: `src/components/theme-toggle.test.ts`

**Interfaces:**

- Consumes: `useTheme()` from `@/components/ThemeProvider`, `nextBinaryTheme(theme)` from `@/components/theme-toggle`, `cn()` from `@/lib/utils`, and `/brand-icon.png`.
- Produces: `DocsThemeToggle(): JSX.Element`, plus a branded title element in `docsLayoutOptions`.

- [ ] **Step 1: Confirm the binary-toggle regression tests cover the button action**

Run: `bun test src/components/theme-toggle.test.ts`

Expected: PASS for dark-to-light and light-or-unknown-to-dark transitions. These existing pure tests cover the state transition invoked by the new button.

- [ ] **Step 2: Implement the compact footer button**

Create `src/components/docs/DocsThemeToggle.tsx` as a client component. Render a `type="button"` control with `aria-label` and `title` set to `Toggle theme`, invoke `setTheme((theme) => nextBinaryTheme(theme))`, and show moon/sun icons using `dark:hidden` and `dark:block`. Apply a `size-8 rounded-full border` treatment with hover and `focus-visible:ring-2` states and `ms-auto` alignment.

- [ ] **Step 3: Complete the brand presentation**

In `layout-options.tsx`, render `Image` with `src="/brand-icon.png"`, empty decorative alt text, `24x24` dimensions, and `dark:invert`. Render `Netroku` followed by a muted `/aci` span. The Fumadocs `nav.url` option supplies the wrapping `/` link.

- [ ] **Step 4: Run focused and full automated checks**

Run: `bun test src/app/docs/layout-options.test.tsx src/components/theme-toggle.test.ts`

Expected: PASS with 4 tests.

Run: `bun test`

Expected: PASS with no failures.

- [ ] **Step 5: Run static and production checks**

Run: `bun run lint`

Expected: exit 0 with no ESLint errors.

Run: `bun run build`

Expected: exit 0 and a successful Next.js production build.

- [ ] **Step 6: Verify `/docs` in the in-app browser**

Open `/docs` at desktop width and verify the brand link targets `/`, Dashboard targets `/dashboard`, both top-level groups are expanded, and the footer contains only the compact icon button rather than the full-width stock theme bar. Toggle light/dark and confirm the icon and colors update. Repeat at a mobile width to confirm the drawer remains usable.

- [ ] **Step 7: Commit the implementation**

```bash
git add src/app/docs/layout.tsx src/app/docs/layout-options.tsx src/app/docs/layout-options.test.tsx src/components/docs/DocsThemeToggle.tsx
git commit -m "feat(docs): improve sidebar navigation"
```
