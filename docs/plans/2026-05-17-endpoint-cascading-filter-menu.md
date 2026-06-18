# Endpoint Cascading Filter Menu Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the staged endpoint filter popover with a hover-driven cascading menu that applies checkbox changes immediately.

**Architecture:** Use the repo's existing dropdown-menu submenu primitives as the interaction shell. Keep the existing URL-driven filter model, reuse active-group counting, and remove local staged filter state so each checkbox writes through directly to routing.

**Tech Stack:** Next.js 16, React 19, TypeScript, Radix-based dropdown menu primitives, Bun tests, ESLint.

---

### Task 1: Replace the filter surface

**Files:**
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`

**Step 1: Establish expected behavior**

Manual verification criteria:
- Clicking the filter icon opens a compact menu containing only VLAN, Node, Interface, and Status.
- Hovering each menu item opens a side submenu.
- Each submenu shows that category's selectable values.

**Step 2: Implement the menu shell**

- swap popover imports for dropdown-menu imports.
- remove staged popover state and stacked filter sections.
- add nested submenus for the four categories.

**Step 3: Run targeted verification**

Run: `npx eslint "src/app/(app)/endpoints/EndpointsClient.tsx"`
Expected: PASS.

### Task 2: Restore immediate filtering behavior

**Files:**
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`

**Step 1: Implement direct updates**

- reintroduce direct per-category filter handlers.
- wire submenu checkbox items to immediate router updates.
- add per-category clear actions.
- preserve active-count badge behavior on the trigger.

**Step 2: Verify behavior**

Run:
```bash
bun test
npx eslint "src/app/(app)/endpoints/EndpointsClient.tsx" src/lib/endpoints/query.ts src/lib/endpoints/query.test.ts
npm run build
```
Expected: all PASS.

**Step 3: Manual smoke test**

Check in browser:
- root menu only lists the four categories.
- hover opens the right-side submenu.
- selecting a value updates the table immediately.
- clearing one category preserves the others.
- refresh keeps URL-backed filter state.

**Step 4: Commit**

```bash
git add src/app/'(app)'/endpoints/EndpointsClient.tsx docs/plans/2026-05-17-endpoint-cascading-filter-menu-design.md docs/plans/2026-05-17-endpoint-cascading-filter-menu.md
git commit -m "feat: redesign endpoint filters as cascading menu"
```
