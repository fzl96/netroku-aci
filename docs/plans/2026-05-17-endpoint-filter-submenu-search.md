# Endpoint Filter Submenu Search Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add local search inputs to only the VLAN and Interface filter submenus.

**Architecture:** Extend the existing reusable submenu component with an opt-in search mode. Keep filtering local to each submenu instance so the URL-backed filter model and immediate-apply behavior remain unchanged.

**Tech Stack:** React 19, TypeScript, existing dropdown menu primitives, existing input component, Bun tests, ESLint.

---

### Task 1: Add opt-in submenu search

**Files:**
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`

**Step 1: Implement local searchable state**
- add a `searchable` prop to the submenu component.
- keep a local query string per submenu.
- derive visible options from that query.
- show a compact search input only when `searchable` is true.
- render a no-results item when filtering removes every option.

**Step 2: Enable only the intended branches**
- set `searchable` for VLAN.
- set `searchable` for Interface.
- leave Node and Status unchanged.

**Step 3: Verify**
Run:
```bash
bun test
npx eslint "src/app/(app)/endpoints/EndpointsClient.tsx" src/lib/endpoints/query.ts src/lib/endpoints/query.test.ts
npm run build
```
Expected: all PASS.

**Step 4: Manual smoke test**
- VLAN submenu shows a search field.
- Interface submenu shows a search field.
- Node and Status do not.
- typing narrows only the active submenu list.
- selecting a filtered result still applies immediately.

**Step 5: Commit**
```bash
git add src/app/'(app)'/endpoints/EndpointsClient.tsx docs/plans/2026-05-17-endpoint-filter-submenu-search-design.md docs/plans/2026-05-17-endpoint-filter-submenu-search.md
git commit -m "feat: add search to endpoint filter submenus"
```
