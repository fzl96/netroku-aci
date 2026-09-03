# Per-interface error-trend drawer

**Date:** 2026-06-13
**Status:** Approved
**Area:** `src/app/(app)/interface-health/`

## Problem

The interfaces page stores per-sample error deltas (`dRxErrors`, `dTxErrors`, etc.)
on every resync, but the table only renders the single latest delta per interface.
A lone delta value is a point-in-time number, not a trend. There is currently no way
to see how an interface's errors have moved over time.

## Goal

Let a user click an interface row and see a chart of that interface's **error deltas
over time** in a right-side drawer, so they can investigate a link that is starting to
error and see when it began.

## Decisions

- **Errors only.** No throughput/byte trends in v1.
- **Six series.** All error/discard deltas: `dRxErrors`, `dTxErrors`, `dRxCrcErrors`,
  `dRxAlignErrors`, `dRxDiscards`, `dTxDiscards`. (Discards are not shown anywhere in
  the UI today; this is their first surface.)
- **Raw delta against real time.** Each point is "new errors since the previous sample";
  x-axis is actual `sampledAt`. No rate normalization — sample spacing is irregular
  (manual resyncs interleave with the scheduled `/api/cron/resync`), and a time-based
  x-axis already conveys the gaps. The plotted numbers match the table exactly.
- **Lazy fetch with a range selector.** Series is fetched when the drawer opens (and on
  range change), not baked into the page load. Range options 24h / 7d / 30d / All,
  default **7d**.

## Architecture

### Trigger & shell
- Each table row in `InterfaceHealthClient.tsx` becomes clickable (pointer cursor) and
  opens a right-side `Sheet` (`src/components/ui/sheet.tsx`). No row content is currently
  interactive, so there is no click conflict.
- Drawer header shows interface identity: `node` / `ifName`, `description`, and the
  existing `OperStBadge` for `operSt` — framing the chart as "the trend behind this row."
- Selected interface id + identity fields are held in client state in
  `InterfaceHealthClient`.

### Data flow (lazy)
- New server action, e.g. `src/actions/interface-samples.ts`:
  `getInterfaceErrorSamples(interfaceId: string, range: '24h' | '7d' | '30d' | 'all')`.
  - Authenticates via the existing session pattern.
  - Queries `prisma.interfaceSample` where `interfaceId` matches and, unless range is
    `all`, `sampledAt >= now - range`. Orders `sampledAt: 'asc'`. Uses the existing
    `@@index([interfaceId, sampledAt])`.
  - Selects `sampledAt` plus the six delta fields.
  - Returns rows with `BigInt` deltas converted to `number | null` (error deltas are
    small; no precision risk) and `sampledAt` as ISO string.
- Fired on `Sheet` open and whenever the range toggle changes. Loading state shown while
  in flight.

### Chart
- shadcn `chart.tsx` wrapper over Recharts `LineChart`.
- X-axis: `sampledAt` as a time scale. Y-axis: error count (shared scale across all six
  series).
- Six `Line` series with distinct colors defined in a `ChartConfig`; clickable legend
  toggles series visibility. Error series reuse the table's danger color cue where it
  makes sense.
- `connectNulls={false}`: a `null` delta (first sample for an interface, or a counter
  reset detected by `computeDelta`) renders as a **break** in the line, never a zero, so
  resets do not draw a fake dip.

### Range selector
- shadcn `toggle-group` (`src/components/ui/toggle-group.tsx`) in the drawer: 24h / 7d /
  30d / All, default 7d. Changing it re-runs the server action.

## States

- **Loading:** skeleton/spinner in the drawer body while the action runs.
- **Empty:** "No samples in this range" when the returned series is empty or entirely
  null (e.g. an interface sampled only once, so every delta is null).
- **Populated:** the line chart.

## Out of scope (v1)

- Throughput / byte-rate trends.
- Rate normalization (errors per minute).
- Exporting from the drawer.
- Comparing multiple interfaces at once.
- Defaulting discard series to "off" — ship all six visible; revisit only if noisy.

## Affected files

- `src/app/(app)/interface-health/InterfaceHealthClient.tsx` — row click, Sheet,
  selected-row state, range state, chart render.
- `src/actions/interface-samples.ts` — new server action (new file).
- Reuses existing `src/components/ui/sheet.tsx`, `chart.tsx`, `toggle-group.tsx`,
  `recharts@3.8.0`, and the `OperStBadge` component.
