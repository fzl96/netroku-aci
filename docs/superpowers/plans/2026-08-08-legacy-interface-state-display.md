# Legacy Interface State Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show only ACI-styled `up` or `down` Admin and Oper states in the Legacy Interfaces list, and remove Speed from the table and visible sort choices.

**Architecture:** Keep raw Legacy state and speed data unchanged across the server boundary. Add one pure display-normalization helper in the existing Legacy interface helper module, then use it only in the Legacy list client; the drawer, filters, summary queries, and backward-compatible server sorting remain untouched.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Bun test, ESLint.

## Global Constraints

- A trimmed, case-insensitive raw value of `up` displays as `up`; every other raw value displays as `down`.
- Admin uses the ACI table's plain muted text treatment.
- Oper uses the ACI table's green-dot `up` or red outlined-pill `down` treatment.
- The mobile card uses the same normalized Oper treatment.
- Remove Speed from the desktop table and from visible sort choices.
- Preserve raw Admin, Oper, and Speed data in filters, database queries, details, and history.
- Preserve server support for existing `?sort=speed` URLs.

---

### Task 1: Binary Legacy interface display-state normalization

**Files:**
- Modify: `src/lib/legacy-ui/interfaces.test.ts`
- Modify: `src/lib/legacy-ui/interfaces.ts`

**Interfaces:**
- Produces: `normalizeLegacyInterfaceState(value: string): 'up' | 'down'`.
- Consumes: Raw Legacy interface Admin and Oper strings.

- [ ] **Step 1: Add the failing normalization test**

Import `normalizeLegacyInterfaceState` from `./interfaces` and add this focused test:

```ts
test('normalizes interface table states to up or down', () => {
  expect(normalizeLegacyInterfaceState('up')).toBe('up')
  expect(normalizeLegacyInterfaceState('UP')).toBe('up')
  expect(normalizeLegacyInterfaceState(' up ')).toBe('up')
  expect(normalizeLegacyInterfaceState('down')).toBe('down')
  expect(normalizeLegacyInterfaceState('notconnect')).toBe('down')
  expect(normalizeLegacyInterfaceState('administratively down')).toBe('down')
  expect(normalizeLegacyInterfaceState('disabled')).toBe('down')
  expect(normalizeLegacyInterfaceState('')).toBe('down')
  expect(normalizeLegacyInterfaceState('unknown')).toBe('down')
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts`

Expected: FAIL because `normalizeLegacyInterfaceState` is not exported from `./interfaces`.

- [ ] **Step 3: Add the minimal normalization helper**

Add to `src/lib/legacy-ui/interfaces.ts`:

```ts
export function normalizeLegacyInterfaceState(value: string): 'up' | 'down' {
  return value.trim().toLowerCase() === 'up' ? 'up' : 'down'
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test src/lib/legacy-ui/interfaces.test.ts`

Expected: all Legacy interface helper tests pass.

- [ ] **Step 5: Commit the tested normalization behavior**

```bash
git add src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts
git commit -m "feat: normalize legacy interface display states"
```

### Task 2: ACI-style state cells and Speed removal

**Files:**
- Modify: `src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx`

**Interfaces:**
- Consumes: `normalizeLegacyInterfaceState(value: string): 'up' | 'down'` from Task 1.
- Produces: A Legacy Interfaces desktop table with plain binary Admin text, an ACI-style binary Oper indicator, no Speed column, and no visible Speed sort option; mobile cards use the same Oper indicator.

- [ ] **Step 1: Replace the generic raw-state badge with an ACI-style Oper display**

Import `normalizeLegacyInterfaceState` alongside `LegacyInterfacePresence`. Replace `stateBadge(value, present)` with a local `operState(value)` function that normalizes first and renders the same compact classes used by ACI:

```tsx
function operState(value: string) {
  const state = normalizeLegacyInterfaceState(value)

  if (state === 'down') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="size-1.5 shrink-0 rounded-full bg-red-500" />
        down
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success">
      <span className="size-1.5 shrink-0 rounded-full bg-success-dot" />
      up
    </span>
  )
}
```

Do not pass `present` into this function; absent inventory remains identified by the existing `Absent` text under the interface name.

- [ ] **Step 2: Normalize Admin and Oper table cells**

Render Admin as plain ACI-style muted text and Oper with `operState`:

```tsx
<td className="px-4 py-3 text-muted-foreground">
  {normalizeLegacyInterfaceState(row.adminSt)}
</td>
<td className="px-4 py-3">{operState(row.operSt)}</td>
```

Update the mobile `DataCardHeader` trailing content to `operState(row.operSt)`.

- [ ] **Step 3: Remove Speed from the desktop table and visible sort choices**

Delete the `<option value="speed">Speed</option>` element. Remove `Speed` from the header-label array and remove the corresponding speed `<td>`. Do not remove `speed` fields from row types, samples, the drawer, or the server's `INTERFACE_SORT_FIELDS` map.

- [ ] **Step 4: Run focused tests and lint**

Run:

```bash
bun test src/lib/legacy-ui/interfaces.test.ts
bun run lint -- src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx'
```

Expected: tests pass and ESLint exits successfully without warnings from the touched files.

- [ ] **Step 5: Verify the rendered Legacy Interfaces list**

Open `/legacy/interfaces` in the shared browser with the local app running and verify:

- Admin cells contain only plain `up` or `down` text.
- Oper cells contain only the green-dot `up` or red-pill `down` treatment.
- Raw strings such as `notconnect`, `administratively down`, and `disabled` do not appear in list state cells.
- The Speed column and Speed sort option are absent.
- The mobile interface-card Oper indicator uses the same binary treatment.
- Opening an interface detail still exposes its raw state and speed data.

- [ ] **Step 6: Commit the Legacy list presentation**

```bash
git add 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx'
git commit -m "feat: align legacy interface states with ACI"
```

- [ ] **Step 7: Run final scoped verification**

Run:

```bash
bun test src/lib/legacy-ui/interfaces.test.ts
bun run lint -- src/lib/legacy-ui/interfaces.ts src/lib/legacy-ui/interfaces.test.ts 'src/app/(app)/legacy/interfaces/LegacyInterfacesClient.tsx'
git diff --check HEAD~2..HEAD
```

Expected: focused tests and lint pass, and the two implementation commits contain no whitespace errors.
