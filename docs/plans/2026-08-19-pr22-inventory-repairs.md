# PR #22 Inventory Repairs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make PR #22 build cleanly and satisfy the reviewed rack, stack, audit, CSV, and live-search requirements.

**Architecture:** Preserve the existing Next.js server-action and Prisma transaction structure. Put deterministic rack and stack decisions in small pure helpers, reuse them from the mutation paths, and follow the repository's established 300 ms debounced-search pattern.

**Tech Stack:** TypeScript 5, Next.js 16, React 19, Prisma 6/PostgreSQL, Zod 4, Bun test, ESLint 9.

---

### Task 1: Repair import audit typing and device-list build output

**Files:**
- Modify: `src/lib/audit.ts`
- Modify: `src/lib/history/query.ts`
- Modify: `src/lib/history/query.test.ts`
- Modify: `src/actions/inventory/devices.ts`
- Modify: `src/app/(app)/inventory/devices/import/DeviceImportClient.tsx`

**Step 1: Write the failing audit-history test**

Add assertions to `src/lib/history/query.test.ts`:

```ts
test('supports filtering device import audit events', () => {
  expect(HISTORY_ACTION_LABELS['device.import']).toBe('Devices imported')
  expect(parseHistoryPageParams({ action: 'device.import' }).action).toBe('device.import')
})
```

**Step 2: Run the test and verify RED**

Run: `bun test src/lib/history/query.test.ts`

Expected: FAIL because `device.import` has no label and is not an accepted history action.

**Step 3: Implement the minimal audit/build repair**

- Add `'device.import'` to `AuditAction`.
- Add `'device.import': 'Devices imported'` to `HISTORY_ACTION_LABELS`.
- Return `pageSize: window.take` from `getDevices`.
- Import `MalformedImportRow` in `DeviceImportClient` and use it instead of `any[]`.
- Remove the unused `fileName` state and the unused map-entry key.

**Step 4: Verify GREEN and type/lint scope**

Run: `bun test src/lib/history/query.test.ts`

Expected: PASS.

Run: `bunx eslint src/lib/audit.ts src/lib/history/query.ts src/lib/history/query.test.ts src/actions/inventory/devices.ts 'src/app/(app)/inventory/devices/import/DeviceImportClient.tsx' 'src/app/(app)/inventory/devices/DevicesClient.tsx'`

Expected: no errors from the edited files.

**Step 5: Commit**

```bash
git add src/lib/audit.ts src/lib/history/query.ts src/lib/history/query.test.ts src/actions/inventory/devices.ts 'src/app/(app)/inventory/devices/import/DeviceImportClient.tsx' 'src/app/(app)/inventory/devices/DevicesClient.tsx'
git commit -m "fix(inventory): integrate import audit history"
```

### Task 2: Skip repeated CSV headers through aliases

**Files:**
- Modify: `src/lib/inventory/csv.test.ts`
- Modify: `src/lib/inventory/csv.ts`

**Step 1: Write failing tests**

Add tests proving both canonical and alias header rows are skipped:

```ts
test('skips repeated canonical and alias header rows', () => {
  const canonical = parseCsvRows(
    [{ hostname: 'hostname', serial_number: 'serial_number', vendor: 'vendor', model: 'model' }],
    ['hostname', 'serial_number', 'vendor', 'model'],
  )
  const aliases = parseCsvRows(
    [{ name: 'name', sn: 'sn', make: 'make', device_model: 'device_model' }],
    ['name', 'sn', 'make', 'device_model'],
  )
  expect(canonical.rows).toHaveLength(0)
  expect(aliases.rows).toHaveLength(0)
})
```

**Step 2: Run the test and verify RED**

Run: `bun test src/lib/inventory/csv.test.ts`

Expected: FAIL because the alias row is parsed as a device.

**Step 3: Implement alias-driven repeated-header detection**

Add a helper that normalizes each required cell and checks that `HEADER_ALIASES[cell]` resolves to the canonical field (`hostname`, `serialNumber`, `vendor`, and `model`). Skip the row when all populated required cells describe their own headers.

**Step 4: Verify GREEN**

Run: `bun test src/lib/inventory/csv.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/inventory/csv.ts src/lib/inventory/csv.test.ts
git commit -m "fix(inventory): skip repeated CSV alias headers"
```

### Task 3: Share and persist dynamic rack capacity

**Files:**
- Create: `src/lib/inventory/import-planning.ts`
- Create: `src/lib/inventory/import-planning.test.ts`
- Modify: `src/actions/inventory/import.ts`

**Step 1: Write the failing rack-planning tests**

Define the wished-for API in the test:

```ts
test('defaults new racks to 42U and grows them through 60U', () => {
  expect(requiredRackHeight(1, 1)).toBe(42)
  expect(requiredRackHeight(43, 1)).toBe(43)
  expect(requiredRackHeight(59, 2)).toBe(60)
})

test('rejects placements above 60U', () => {
  expect(() => requiredRackHeight(60, 2)).toThrow('exceeds maximum rack height')
})
```

**Step 2: Run the test and verify RED**

Run: `bun test src/lib/inventory/import-planning.test.ts`

Expected: FAIL because `requiredRackHeight` does not exist.

**Step 3: Implement the pure rack helper**

```ts
export function requiredRackHeight(rackPosition: number | null, deviceHeight: number): number {
  const topU = (rackPosition ?? 1) + deviceHeight - 1
  if (topU > 60) throw new Error(`Position U${topU} exceeds maximum rack height (60U)`)
  return Math.max(42, topU)
}
```

**Step 4: Run the helper tests and verify GREEN**

Run: `bun test src/lib/inventory/import-planning.test.ts`

Expected: PASS.

**Step 5: Wire the helper into validation and execution**

- Include `heightU` in `ImportSummary.racksToCreate`.
- Accumulate the maximum required height for each new rack during validation.
- Treat helper errors as row validation errors.
- Recompute the same maximum from valid rows before execution.
- Persist the computed height instead of hardcoding `42`.

**Step 6: Run focused inventory tests**

Run: `bun test src/lib/inventory src/lib/schemas/device.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/inventory/import-planning.ts src/lib/inventory/import-planning.test.ts src/actions/inventory/import.ts
git commit -m "fix(inventory): size dynamically imported racks"
```

### Task 4: Enforce automatic stack-master promotion

**Files:**
- Create: `src/lib/inventory/stack-master.ts`
- Create: `src/lib/inventory/stack-master.test.ts`
- Modify: `src/actions/inventory/devices.ts`
- Modify: `src/actions/inventory/import.ts`

**Step 1: Write failing master-selection tests**

Test the wished-for `selectMasterCandidate` behavior:

```ts
test('preserves an existing master', () => {
  expect(selectMasterCandidate(membersWithMaster)?.id).toBe('master')
})

test('promotes the lowest-numbered remaining member', () => {
  expect(selectMasterCandidate(memberOnlyStack)?.id).toBe('switch-1')
})

test('excludes an explicitly demoted master when another member exists', () => {
  expect(selectMasterCandidate(memberOnlyStack, 'switch-1')?.id).toBe('switch-2')
})
```

Also cover null switch numbers and deterministic name/ID tie-breaking.

**Step 2: Run the tests and verify RED**

Run: `bun test src/lib/inventory/stack-master.test.ts`

Expected: FAIL because the module/helper does not exist.

**Step 3: Implement selection and transactional enforcement**

- Implement `selectMasterCandidate` as a pure function.
- Implement `ensureStackHasMaster(tx, stackId, excludedDeviceId?)` using a narrow Prisma transaction-client interface.
- Return immediately for an empty stack or when a master already exists.
- Otherwise update the selected candidate to `MASTER`.

**Step 4: Run the helper tests and verify GREEN**

Run: `bun test src/lib/inventory/stack-master.test.ts`

Expected: PASS.

**Step 5: Wire every mutation path**

- `createDevice`: enforce after creation.
- `updateDevice`: enforce the previous and next stacks; when explicitly changing `MASTER` to `MEMBER`, exclude that device if another candidate exists.
- `deleteDevice`: enforce the surviving stack before returning.
- `executeDeviceImport`: collect affected previous/next stack IDs and enforce them after all row writes.
- Preserve existing orphan-stack deletion and master-demotion behavior.

**Step 6: Run focused tests**

Run: `bun test src/lib/inventory/stack-master.test.ts src/lib/schemas/device.test.ts`

Expected: PASS.

**Step 7: Commit**

```bash
git add src/lib/inventory/stack-master.ts src/lib/inventory/stack-master.test.ts src/actions/inventory/devices.ts src/actions/inventory/import.ts
git commit -m "fix(inventory): auto-promote stack masters"
```

### Task 5: Add live search and remove effect-derived form state

**Files:**
- Create: `src/lib/inventory/device-form-state.ts`
- Create: `src/lib/inventory/device-form-state.test.ts`
- Modify: `src/components/inventory/DeviceForm.tsx`
- Modify: `src/app/(app)/inventory/devices/DevicesClient.tsx`
- Modify: `src/lib/inventory/device-query.test.ts`
- Modify: `src/lib/inventory/device-query.ts`

**Step 1: Write failing form-state and navigation tests**

Test a wished-for stack selector helper:

```ts
expect(resolveStackSelectValue(null, stacks)).toBe('__none__')
expect(resolveStackSelectValue('', stacks)).toBe('__new__')
expect(resolveStackSelectValue('known', stacks)).toBe('known')
expect(resolveStackSelectValue('new-name', stacks)).toBe('__new__')
```

Add a device-query assertion that a changed search resets pagination:

```ts
expect(buildDeviceSearchUrl(' leaf ')).toBe('/inventory/devices?q=leaf')
```

**Step 2: Run tests and verify RED**

Run: `bun test src/lib/inventory/device-form-state.test.ts src/lib/inventory/device-query.test.ts`

Expected: FAIL because the new helpers do not exist.

**Step 3: Implement pure helpers and verify GREEN**

- Implement `resolveStackSelectValue` from current form value and existing stack names.
- Implement `buildDeviceSearchUrl(query)` as a page-one wrapper around `buildDeviceListUrl`.

Run: `bun test src/lib/inventory/device-form-state.test.ts src/lib/inventory/device-query.test.ts`

Expected: PASS.

**Step 4: Update the React components**

- Remove `stackSelectValue` state and its synchronizing effect from `DeviceForm`; use `resolveStackSelectValue` during render and update only form fields in the dropdown handler.
- In `DevicesClient`, add `useTransition`, a timeout ref, a dispatched-query ref, prop-resynchronization that does not clobber active typing, 300 ms cleanup, and `router.replace(buildDeviceSearchUrl(value))`.
- Keep form submit as an immediate fallback and use transitions for pagination.

**Step 5: Verify tests and changed React lint**

Run: `bun test src/lib/inventory/device-form-state.test.ts src/lib/inventory/device-query.test.ts`

Expected: PASS.

Run: `bunx eslint src/components/inventory/DeviceForm.tsx 'src/app/(app)/inventory/devices/DevicesClient.tsx' src/lib/inventory/device-form-state.ts src/lib/inventory/device-query.ts`

Expected: PASS with no errors or warnings.

**Step 6: Commit**

```bash
git add src/lib/inventory/device-form-state.ts src/lib/inventory/device-form-state.test.ts src/lib/inventory/device-query.ts src/lib/inventory/device-query.test.ts src/components/inventory/DeviceForm.tsx 'src/app/(app)/inventory/devices/DevicesClient.tsx'
git commit -m "fix(inventory): add live device search"
```

### Task 6: Full verification and final review

**Files:**
- Review all files changed since `48d7ad2c0dd2885551aea225a086895553862e8f`.

**Step 1: Run focused inventory tests**

Run: `bun test src/lib/inventory src/lib/schemas/device.test.ts src/lib/history/query.test.ts`

Expected: all focused tests pass.

**Step 2: Run the complete suite**

Run: `bun test`

Expected: all tests pass.

**Step 3: Run changed-file lint**

Run: `git diff --name-only 48d7ad2c0dd2885551aea225a086895553862e8f...HEAD -- '*.ts' '*.tsx' | xargs bunx eslint`

Expected: zero errors. Pre-existing warnings outside the PR are irrelevant; PR-changed files should be clean.

**Step 4: Run production build and diff checks**

Run: `bun run build`

Expected: successful production build.

Run: `git diff --check 48d7ad2c0dd2885551aea225a086895553862e8f...HEAD`

Expected: no output and exit code 0.

**Step 5: Inspect final scope**

Run: `git status --short --branch && git diff --stat 48d7ad2c0dd2885551aea225a086895553862e8f...HEAD`

Expected: clean worktree and only the approved inventory repair scope beyond the original PR head.
