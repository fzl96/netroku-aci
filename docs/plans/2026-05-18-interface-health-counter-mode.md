# Interface Health Counter Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Delta/Current toggle to the Interface Health table while keeping Delta as the default view.

**Architecture:** Fetch both raw and derived counter fields from the latest `InterfaceSample` in the server page. Keep one table in the client and route visible values through a small pure selector that returns the correct field set for `delta` or `current` mode.

**Tech Stack:** Next.js App Router, React 19, Prisma, TypeScript, Bun test runner

---

### Task 1: Cover visible counter selection

**Files:**
- Create: `src/app/(app)/interface-health/counter-mode.ts`
- Create: `src/app/(app)/interface-health/counter-mode.test.ts`

**Step 1: Write the failing test**
- Add tests proving `selectVisibleCounters(row, 'delta')` returns the `d*` values and `selectVisibleCounters(row, 'current')` returns the raw values.

**Step 2: Run test to verify it fails**
- Run: `bun test 'src/app/(app)/interface-health/counter-mode.test.ts'`
- Expected: FAIL because `counter-mode.ts` does not exist yet.

**Step 3: Write minimal implementation**
- Add `CounterMode`, `VisibleCounters`, and `selectVisibleCounters` that map the two mode variants to one normalized shape.

**Step 4: Run test to verify it passes**
- Run: `bun test 'src/app/(app)/interface-health/counter-mode.test.ts'`
- Expected: PASS.

### Task 2: Thread raw latest counters into the page model

**Files:**
- Modify: `src/app/(app)/interface-health/page.tsx`
- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

**Step 1: Extend the row contract**
- Add raw latest-sample strings for bytes and error counters to `InterfaceRowProps`.

**Step 2: Fetch raw counters from Prisma**
- Add `rxBytes`, `rxErrors`, `rxCrcErrors`, `rxAlignErrors`, `txBytes`, and `txErrors` to the latest-sample select and serialize them into the row payload.

**Step 3: Verify type safety**
- Run: `bunx tsc --noEmit`
- Expected: PASS once all newly required props are supplied.

### Task 3: Add the toggle and swap table rendering

**Files:**
- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

**Step 1: Add mode state**
- Introduce local `counterMode` state defaulting to `delta`.

**Step 2: Add a compact segmented toggle**
- Place `Delta` and `Current` controls near the existing filter/search controls.

**Step 3: Swap headers and visible values**
- Render headers with `Δ` in delta mode and plain names in current mode.
- Use `selectVisibleCounters` for the six rendered counter cells so first-sync current values show immediately while delta remains unchanged.

**Step 4: Verify app quality gates**
- Run: `bun test 'src/app/(app)/interface-health/counter-mode.test.ts'`
- Run: `bunx tsc --noEmit`
- Run: `bun run lint`
- Expected: all pass.
