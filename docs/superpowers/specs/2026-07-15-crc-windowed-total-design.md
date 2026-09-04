# Per-port windowed CRC total in the Counting-CRC view

**Date:** 2026-07-15
**Status:** Approved, ready for planning

## Problem

The interface-health page has a **Counting CRC** view that lists ports which
accumulated CRC errors over the trailing 7 days. The header reads
*"N interfaces (CRC delta in last 7d)"*, but each row's **CRC Δ** column shows
only the *latest sample's* delta — the errors gained since the previous poll.

This creates a disconnect: a port qualifies for the list because of its 7-day
accumulation, but its cell can read `0` (spiked earlier, quiet now) or `Reset`
(counter reset between the last two polls). The per-row number does not explain
why the port is in the list, and the list cannot be scanned for "which port has
the worst CRC increase."

## Goal

In the Counting-CRC view, surface **per-port cumulative CRC increase over a
selectable window (7d or 30d)** — the sum of positive CRC deltas across the
window, the latest delta included as its newest contribution. This is the
number that determines list membership and severity. The list becomes
self-explanatory and rankable.

Non-goals: per-port sparklines (possible later add-on), changes to the "All"
view, changes to rx/tx/align columns.

## Design

### 1. Data layer (`page.tsx`)

- Add a `window` search param with values `7d` (default) and `30d`. In the CRC
  view it drives the sample cutoff, replacing the hardcoded `sevenDaysAgo` at
  `page.tsx:84`.
- Replace the `distinct` "which interfaces have CRC" query (`page.tsx:88-97`)
  with a single `prisma.interfaceSample.groupBy`:
  - `by: ['interfaceId']`
  - `where: { apicHostId, sampledAt: { gte: windowStart }, dRxCrcErrors: { gt: 0 } }`
  - `_sum: { dRxCrcErrors: true }`

  This one query yields both the qualifying interface id set (the group keys)
  and each port's windowed total (`_sum.dRxCrcErrors`).
- Attach `crcWindowTotal` (BigInt serialised to a decimal string, matching the
  other counter fields) to each `InterfaceRowProps` in the CRC view. In the
  "All" view it is `null`/absent.
- The trend chart (`rawCrcSamples` / `aggregateCrcTrend`) and the header count
  use the same `window` param, so chart, filter, and column stay consistent.

### 2. Table column (CRC view only)

- Replace the snapshot-only **CRC Δ** column with **CRC (7d)** / **CRC (30d)**
  showing the windowed sum: `tabular-nums`, bold + `text-danger` when non-zero,
  `text-faint` when zero.
- Secondary subtext under the total shows the latest interval, so a single cell
  answers "how bad over the window" (headline) and "still active / settled /
  reset" (detail):
  - latest delta > 0 → `+<n> last poll`
  - latest delta == 0 → `0 last poll`
  - latest delta null → `reset`
- Default sort in the CRC view = `crcWindowTotal` descending (worst offender on
  top). Column is sortable like the other numeric columns. This is a
  deliberate change from the current node/ifName default ordering, accepted so
  the list is rankable at a glance.
- The "All" view is unchanged: it keeps the plain latest-snapshot CRC Δ column
  and its existing default ordering.

### 3. Window toggle (UI)

- A **7d / 30d** segmented toggle, same visual style as the existing
  Delta/Current and All/Counting-CRC toggles, rendered **only in the CRC
  view**, placed next to the Delta/Current toggle.
- The Delta/Current toggle continues to govern only the rx/tx/align columns.

### 4. Details that fall out

- Header text becomes window-aware:
  *"N interfaces (CRC increase in last 7d)"* / *"…30d"*.
- `Reset` no longer corrupts the ranking: a counter reset contributes 0 to the
  sum (negative/absent deltas are excluded by the `gt: 0` filter), and the row
  still shows its real windowed total with `reset` as subtext.
- Empty-state copy stays, parametrised by the active window.

## Testing

- Add a pure helper that computes the per-port windowed sum from raw samples
  (grouping + zero/reset handling), unit-tested without the DB — mirrors the
  existing `crc-trend.ts` / `crc-trend.test.ts` pattern.
- Add a `sort.ts` test case covering the new `crcWindowTotal` sort key.

## Open questions

None outstanding. Default-sort-by-total was confirmed as the desired behavior.
