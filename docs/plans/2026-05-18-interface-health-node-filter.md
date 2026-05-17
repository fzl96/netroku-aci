# Interface Health Node Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the Usage table column with Description and change Interface Health filtering from usage-based to node-based.

**Architecture:** Keep the existing page/server/client split, but rename the filter contract from usage to node all the way through the URL, Prisma query, props, export payload, and dropdown state. Replace the visual usage cell with the already-available description field so the table shows human context instead of role metadata.

**Tech Stack:** Next.js App Router, React 19, Prisma, TypeScript, Bun test runner

---

### Task 1: Switch filter semantics from usage to node

**Files:**
- Modify: `src/app/(app)/interface-health/page.tsx`
- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

**Steps:**
1. Rename the parsed search param and props from usage to node.
2. Filter `InterfaceSnapshot` rows by `node` instead of `usage`.
3. Load distinct available nodes instead of distinct usages.
4. Persist selected nodes in the URL as `node=a,b` and send node filters through export requests.
5. Update dropdown labels, active state, and toggle handler names to node language.

### Task 2: Replace the visible table column

**Files:**
- Modify: `src/app/(app)/interface-health/InterfaceHealthClient.tsx`

**Steps:**
1. Remove the `UsageLabel` presentation helper if it becomes unused.
2. Replace the `Usage` header with `Description`.
3. Render `description || '—'` in the corresponding cell.

### Task 3: Verify the page still behaves cleanly

**Files:**
- Verify touched files only.

**Steps:**
1. Run targeted lint on the modified interface-health files.
2. Run `bun test`.
3. Run `bun run build`.
