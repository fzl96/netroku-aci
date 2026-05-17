# Interface Health Natural Sort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Sort Interface Health rows in human interface order so `eth1/2` appears before `eth1/10`.

**Architecture:** Add a small pure natural-sort helper for interface health rows and test it directly. Fetch the filtered row set from Prisma in stable lexical order, apply natural sorting by node and interface name in application code, then paginate the sorted list so ordering remains correct across pages.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, Bun test runner

---

### Task 1: Add natural sorting helper with tests

**Files:**
- Create: `src/app/(app)/interface-health/sort.ts`
- Create: `src/app/(app)/interface-health/sort.test.ts`

**Steps:**
1. Write a failing test proving `eth1/2` sorts before `eth1/10` and node `2` sorts before node `10`.
2. Run the focused test and confirm it fails because the helper does not exist yet.
3. Implement a natural comparator using numeric collation and a row sort helper.
4. Re-run the focused test and confirm it passes.

### Task 2: Sort before pagination

**Files:**
- Modify: `src/app/(app)/interface-health/page.tsx`

**Steps:**
1. Import the sort helper.
2. Load the filtered snapshot rows without database pagination.
3. Natural-sort the rows, then apply `skip`/`take` in memory.
4. Reuse the sorted slice for mapping table rows and distinct-node rendering.

### Task 3: Verify

**Steps:**
1. Run the focused sort test.
2. Run `bun test`.
3. Run targeted lint on touched files.
4. Run `bun run build`.
