# Endpoint Filter Popover Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the four visible endpoint filter controls with one filter-icon popover that stages changes and applies them together.

**Architecture:** Keep the existing URL-driven filtering model in `EndpointsClient`, but introduce local staged filter state inside a new composite popover. The toolbar becomes search + one filter trigger, while Apply/Clear coordinate bulk updates to the existing router flow.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing shadcn/base UI primitives, Tabler icons, ESLint.

---

### Task 1: Add staged composite filter UI

**Files:**
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`

**Step 1: Write the failing test**

There is no UI test harness in this repo, so capture the intended behavior as manual verification criteria before implementation:
- Toolbar shows one filter trigger instead of four visible filter buttons.
- Opening the popover reveals VLAN, Node, Interface, and Status controls.
- Changing selections does not update the URL or table until Apply is clicked.
- Closing and reopening without applying restores currently applied selections.

**Step 2: Verify baseline**

Run: `npm run lint`
Expected: PASS before the change.

**Step 3: Write minimal implementation**

In `EndpointsClient.tsx`:
- import a filter icon from Tabler icons.
- add local staged state for the four filter groups.
- create a composite `EndpointFiltersPopover` component or equivalent local JSX.
- initialize staged values from applied filters when opening.
- replace the four toolbar `FilterCombobox` triggers with one filter-icon button.

**Step 4: Run verification**

Run: `npm run lint`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/'(app)'/endpoints/EndpointsClient.tsx
git commit -m "feat: consolidate endpoint filters into popover"
```

### Task 2: Add Apply/Clear behavior and active-state feedback

**Files:**
- Modify: `src/app/(app)/endpoints/EndpointsClient.tsx`

**Step 1: Define expected behavior**

Manual verification criteria:
- Apply commits all staged filters in one navigation.
- Clear empties staged selections and can remove all applied filters after Apply.
- The trigger button shows an active treatment and a count badge based on active filter groups.
- Disabled/pending states still prevent duplicate actions.

**Step 2: Implement behavior**

In `EndpointsClient.tsx`:
- add one bulk apply handler that reuses `buildUrl` and resets page to 1.
- add clear behavior for staged selections.
- compute active filter-group count from the applied filters.
- style the trigger to distinguish filtered vs unfiltered state.

**Step 3: Run verification**

Run: `npm run lint && npm run build`
Expected: both PASS.

**Step 4: Manual smoke test**

Run: `npm run dev`
Expected checks in browser:
- popover opens from one filter button.
- multiple staged edits do not reload the table until Apply.
- Apply updates the table once and preserves URL-backed state on refresh.
- Clear + Apply removes all filters.
- active badge matches the number of populated groups.

**Step 5: Commit**

```bash
git add src/app/'(app)'/endpoints/EndpointsClient.tsx
git commit -m "feat: add staged endpoint filter actions"
```
