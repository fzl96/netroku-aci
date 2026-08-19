# Scheduler Timing Consistency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep persisted scheduler deadlines and the open Scheduler page accurate after interval edits, in-flight edits, manual queueing, and background completions.

**Architecture:** Put edit-time deadline policy in a pure timing helper, keep finalization transactional so it reads the latest interval under a row lock, and make server actions return authoritative safe rows. A small client poller refreshes the scheduler snapshot every ten seconds without adding a data-fetching dependency.

**Tech Stack:** TypeScript, Bun test, Next.js 16 server actions, React 19, Prisma 6, PostgreSQL.

---

### Task 1: Define interval-edit deadline policy

**Files:**
- Modify: `src/lib/apic/schedule-timing.ts`
- Test: `src/lib/apic/schedule-timing.test.ts`

1. Write failing tests for `computeEditedNextRunAt`: 1h→4h derives from last completion; a shortened overdue interval clamps to `now`; an unchanged interval retains its deadline; first-time/re-enabled returns `now`; disabled returns `null`.
2. Run `bun test src/lib/apic/schedule-timing.test.ts` and verify it fails because the helper is absent.
3. Implement the minimal pure helper using `computeNextRunAt`.
4. Rerun the timing test and verify it passes.

### Task 2: Apply timing policy in schedule edits

**Files:**
- Modify: `src/actions/resync-schedules.ts`
- Create: `src/actions/resync-schedules.test.ts`

1. Write failing action tests using complete in-memory boundaries for auth, Prisma, audit, and crypto. Cover 1h→4h, unchanged interval, disable, and re-enable.
2. Run `bun test src/actions/resync-schedules.test.ts` and verify the edit retains the old deadline.
3. Call `computeEditedNextRunAt` from `upsertResyncSchedule` and persist its result.
4. Run the action and timing tests and verify they pass.

### Task 3: Finalize with the latest persisted interval

**Files:**
- Modify: `src/lib/apic/schedule-claim.ts`
- Modify: `src/app/api/cron/tick/route.ts`
- Create: `src/lib/apic/schedule-claim.test.ts`

1. Write a failing transaction-level test: a claim carries 60 minutes, the locked row contains 240, and finalization must persist completion plus four hours.
2. Run `bun test src/lib/apic/schedule-claim.test.ts` and verify RED.
3. Remove interval from the finalization input. Inside `prisma.$transaction`, lock/read the current row with `SELECT ... FOR UPDATE`, compute from its current interval, update completion state, and preserve the missing-row error path. Update the ticker caller.
4. Run claim and ticker tests and verify GREEN.

### Task 4: Return authoritative queued state

**Files:**
- Modify: `src/actions/resync-schedules.ts`
- Test: `src/actions/resync-schedules.test.ts`

1. Add a failing test that `runResyncScheduleNow` returns a complete safe schedule with a queued deadline while preserving the previous last completion.
2. Verify the test receives `undefined` before implementation.
3. Return the updated safe row and add a non-cached authenticated `refreshResyncSchedules` action.
4. Rerun action tests and verify GREEN.

### Task 5: Synchronize the Scheduler client

**Files:**
- Create: `src/lib/apic/schedule-polling.ts`
- Create: `src/lib/apic/schedule-polling.test.ts`
- Modify: `src/app/(app)/scheduler/SchedulerClient.tsx`

1. Write failing poller tests for successful snapshots, failed refresh preservation, late-response cancellation, and timer disposal.
2. Run `bun test src/lib/apic/schedule-polling.test.ts` and verify the module is absent.
3. Implement a ten-second cancellable poller. Start/dispose it in a client effect, apply snapshots, and replace the queued row immediately after Run now.
4. Run poller and action tests and verify GREEN.

### Task 6: Verify the complete fix

1. Run all scheduler-focused tests.
2. Run `bun test`.
3. Run changed-file ESLint and `git diff --check`.
4. Run `bun run build`.
5. Review the diff for approved scheduler scope only and remove all temporary artifacts.
