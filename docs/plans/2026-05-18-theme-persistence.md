# Theme Persistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the existing light/dark theme selection across refreshes by replacing the hand-rolled provider with `next-themes`.

**Architecture:** Keep the UI binary while moving persistence and pre-hydration DOM syncing into `next-themes`. Retain the app's existing `dark` class styling by configuring the provider with `attribute="class"`, and let the sidebar derive the next theme through a small tested helper.

**Tech Stack:** Next.js App Router, React 19, TypeScript, next-themes, Node test runner

---

### Task 1: Add the binary toggle helper

**Files:**
- Create: `src/components/theme-toggle.ts`
- Create: `src/components/theme-toggle.test.ts`

**Step 1: Write the failing test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { nextBinaryTheme } from "./theme-toggle";

test("nextBinaryTheme flips dark to light", () => {
  assert.equal(nextBinaryTheme("dark"), "light");
});

test("nextBinaryTheme treats light or unknown as dark", () => {
  assert.equal(nextBinaryTheme("light"), "dark");
  assert.equal(nextBinaryTheme(undefined), "dark");
});
```

**Step 2: Run the focused test to verify it fails**

Run: `bun test src/components/theme-toggle.test.ts`
Expected: FAIL because `./theme-toggle` does not exist yet.

**Step 3: Write the minimal implementation**

```ts
export type BinaryTheme = "light" | "dark";

export function nextBinaryTheme(theme: string | undefined): BinaryTheme {
  return theme === "dark" ? "light" : "dark";
}
```

**Step 4: Run the focused test to verify it passes**

Run: `bun test src/components/theme-toggle.test.ts`
Expected: PASS.

### Task 2: Replace the custom provider with `next-themes`

**Files:**
- Modify: `src/components/ThemeProvider.tsx`
- Modify: `src/components/AppSidebar.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Replace the provider**

Wrap children with `ThemeProvider` from `next-themes` using `attribute="class"`, `defaultTheme="light"`, `enableSystem={false}`, and `disableTransitionOnChange`.

**Step 2: Update the sidebar switcher**

Read `resolvedTheme` and `setTheme` from the local re-exported hook, then use `nextBinaryTheme(resolvedTheme)` when clicked.

**Step 3: Update the root layout**

Add `suppressHydrationWarning` to `<html>` and remove the stale inline-script comment.

### Task 3: Verify and commit

**Files:**
- Verify all changed files

**Step 1: Run verification**

Run:
```bash
bun test src/components/theme-toggle.test.ts
bun run lint
bun run build
```
Expected: all commands exit 0.

**Step 2: Commit**

```bash
git add docs/plans/2026-05-18-theme-persistence-design.md docs/plans/2026-05-18-theme-persistence.md src/components/theme-toggle.ts src/components/theme-toggle.test.ts src/components/ThemeProvider.tsx src/components/AppSidebar.tsx src/app/layout.tsx
git commit -m "fix(theme): persist light and dark preference"
```
