# Public Root Route Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep `/` public while preserving proxy authentication for non-authenticated access to protected pages.

**Architecture:** Leave the existing matcher unchanged and model public routes explicitly inside `proxy()`. Add narrow tests around the root route and a representative protected route before changing production logic.

**Tech Stack:** Next.js proxy middleware, TypeScript, Bun test runner

---

### Task 1: Cover the public root route

**Files:**
- Create: `src/proxy.test.ts`
- Modify: `src/proxy.ts`

**Step 1: Write the failing test**

Add tests that verify signed-out access to `/` returns `NextResponse.next()` behavior, while signed-out access to `/apic-hosts` redirects to `/signin`.

**Step 2: Run test to verify it fails**

Run: `bun test src/proxy.test.ts`
Expected: FAIL because `/` still redirects to `/signin`.

**Step 3: Write minimal implementation**

Add an explicit public-route check for `/` and exclude public routes from the signed-out redirect branch.

**Step 4: Run test to verify it passes**

Run: `bun test src/proxy.test.ts`
Expected: PASS.

**Step 5: Verify nearby quality gates**

Run: `bun test src/proxy.test.ts && bun run lint`
Expected: both commands exit 0.
