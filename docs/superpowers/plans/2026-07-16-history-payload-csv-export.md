# History Payload CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a History-row action that downloads Deploy and Rollback payloads in each originating workflow's canonical CSV upload format.

**Architecture:** A pure `export-utils.ts` module identifies the audit workflow from `target`, maps stored payload rows into explicit upload columns, serializes them with Papa Parse, and returns CSV text plus a filename. `HistoryClient.tsx` renders the action only when that helper confirms the entry is exportable and performs a browser Blob download.

**Tech Stack:** TypeScript, React 19, Next.js 16, Papa Parse, Bun test, Tabler Icons

## Global Constraints

- Support both Deploy and Rollback audit actions.
- Recreate canonical upload columns and never export internal fields such as `rowIndex`, `card`, or `port_num`.
- Preserve the existing expanded JSON payload.
- Do not add an API route or database change.
- Do not render an export action for empty, malformed, or unsupported payloads.

---

### Task 1: Pure History payload CSV builder

**Files:**
- Create: `src/app/(app)/history/export-utils.ts`
- Create: `src/app/(app)/history/export-utils.test.ts`

**Interfaces:**
- Consumes: audit `action`, `target`, `payload`, and `createdAt`.
- Produces: `buildHistoryPayloadCsvExport(input): HistoryPayloadCsvExport | null`, where `HistoryPayloadCsvExport` contains `csv` and `filename`.

- [ ] **Step 1: Write failing tests for supported workflow mappings**

Create table-driven tests that call `buildHistoryPayloadCsvExport` with Static Port, Interface Selector, Bridge Domain L2/L3, EPG, and EPG contract targets. Assert exact header order, converted values, absence of internal fields, and filenames such as `static-ports-deploy-2026-07-15.csv`.

```ts
const result = buildHistoryPayloadCsvExport({
  action: 'deploy',
  target: 'static-ports @ 10.220.251.51',
  createdAt: new Date('2026-07-15T10:36:19.000Z'),
  payload: [{ rowIndex: 13, tenant: 'SERVERFARM', ap: 'DC-SERVERFARM_AP', epg: 'VLAN401_EPG', vlan: 401, node1: 1107, node2: null, port_type: 'port', interface_or_ipg: 'eth1/30', mode: 'regular', immediacy: 'immediate' }],
})

expect(result?.csv).toBe(
  'tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy\r\n' +
  'SERVERFARM,DC-SERVERFARM_AP,VLAN401_EPG,401,1107,,port,eth1/30,regular,immediate',
)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/history/export-utils.test.ts'`

Expected: FAIL because `./export-utils` does not exist.

- [ ] **Step 3: Implement the minimal pure exporter**

Define explicit workflow configurations selected from the target prefix:

```ts
type HistoryPayloadCsvExport = { csv: string; filename: string }

export function buildHistoryPayloadCsvExport(input: {
  action: string
  target: string | null
  payload: unknown
  createdAt: Date | string
}): HistoryPayloadCsvExport | null
```

Use Papa Parse's `unparse({ fields, data })`. Normalize `null` and `undefined` to empty strings. Join `consContracts` and `provContracts` arrays with commas for `cons_contract` and `prov_contract`. Select these canonical configurations:

```text
static-ports: tenant,ap,epg,vlan,node1,node2,port_type,interface_or_ipg,mode,immediacy
interface-selectors: interface_profile,selector_name,port,ipg_name,ipg_type,description
bridge-domains:l2: tenant,bd,vrf,bd_desc
bridge-domains:l3: tenant,bd,vrf,subnet,l3out,bd_desc
epg: tenant,anp,epg,bd_tenant,bd,phys_domain,contract_tenant,cons_contract,prov_contract,epg_desc
epg:consumer and epg:provider: tenant,anp,epg,bd_tenant,bd,phys_domain,contract_tenant,contract,epg_desc
```

Return `null` unless the action is Deploy/Rollback, the target prefix is supported, and payload is a non-empty array of non-null non-array objects.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test 'src/app/(app)/history/export-utils.test.ts'`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit the pure exporter**

```bash
git add 'src/app/(app)/history/export-utils.ts' 'src/app/(app)/history/export-utils.test.ts'
git commit -m "feat: build history payload csv exports"
```

### Task 2: History export control and browser download

**Files:**
- Modify: `src/app/(app)/history/HistoryClient.tsx`
- Test: `src/app/(app)/history/export-utils.test.ts`

**Interfaces:**
- Consumes: `buildHistoryPayloadCsvExport` from Task 1.
- Produces: An **Export CSV** button in supported expanded Deploy/Rollback payload panels.

- [ ] **Step 1: Add a failing eligibility regression test**

Add assertions that unsupported actions, unknown target prefixes, empty arrays, primitive payloads, and arrays containing non-object rows return `null`. Also assert a Rollback entry produces a `-rollback-YYYY-MM-DD.csv` filename.

```ts
expect(buildHistoryPayloadCsvExport({
  action: 'resync.nodes',
  target: 'nodes @ apic.example',
  payload: [{ node: 101 }],
  createdAt: '2026-07-15T10:36:19.000Z',
})).toBeNull()
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test 'src/app/(app)/history/export-utils.test.ts'`

Expected: at least one new eligibility assertion fails until validation is complete.

- [ ] **Step 3: Complete eligibility validation and add the UI control**

In each mapped history row, calculate the export result once. When the payload row is expanded and the result is non-null, render a compact button with `IconDownload` and label `Export CSV` above the existing `<pre>`.

Add a local download handler:

```ts
function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
```

Keep `JSON.stringify(log.payload, null, 2)` in place below the action.

- [ ] **Step 4: Run focused tests, lint the changed files, and build**

Run:

```bash
bun test 'src/app/(app)/history/export-utils.test.ts'
bunx eslint 'src/app/(app)/history/HistoryClient.tsx' 'src/app/(app)/history/export-utils.ts' 'src/app/(app)/history/export-utils.test.ts'
bun run build
```

Expected: every command exits 0 with zero test failures and zero lint errors.

- [ ] **Step 5: Verify the interaction in the in-app browser**

Start the development server, open the History page in the T3 collaborative browser, expand a representative Deploy or Rollback payload, and confirm that **Export CSV** appears above the unchanged JSON. Trigger it and confirm the browser observes a CSV download with the expected filename. If authentication or representative audit data is unavailable, document that limitation and rely on the tested pure exporter plus production build.

- [ ] **Step 6: Commit the History UI integration**

```bash
git add 'src/app/(app)/history/HistoryClient.tsx' 'src/app/(app)/history/export-utils.test.ts'
git commit -m "feat: export history payloads as csv"
```

### Task 3: Final regression verification

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: completed exporter and History UI integration.
- Produces: fresh evidence that the repository remains healthy.

- [ ] **Step 1: Run the complete test suite**

Run: `bun test`

Expected: all repository tests pass with zero failures.

- [ ] **Step 2: Run repository lint**

Run: `bun run lint`

Expected: exits 0 with zero errors.

- [ ] **Step 3: Run a fresh production build**

Run: `bun run build`

Expected: exits 0 and Next.js reports a successful production build.

- [ ] **Step 4: Inspect the final diff and status**

Run: `git status --short && git log -3 --oneline`

Expected: only intentional plan/spec or implementation state is present, and the feature commits are visible.
