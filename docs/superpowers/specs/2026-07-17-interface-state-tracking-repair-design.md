# Interface state tracking repair

**Date:** 2026-07-17
**Status:** Approved design, pending written-spec review

## Problem

PR #12 adds interface state-change filtering and status history, but four
issues prevent it from being merge-ready:

1. The Prisma `where` object can receive two top-level `OR` properties. When a
   text query is active, its `OR` replaces the state-change `OR`, so unchanged
   interfaces can appear in the State Changes view.
2. Both the page and drawer fetch only samples at or after the window cutoff.
   The first sample in the window has no predecessor and is therefore never
   identified as a transition, even when it differs from the immediately
   preceding sample.
3. Drawer failure booleans outlive the request that produced them. A later
   successful request for another range or view can still render the old
   failure state.
4. The page loads every status sample for an APIC host and window into the
   application process, then groups and sorts the dense history in JavaScript.
   Work and memory therefore grow with interfaces multiplied by resyncs.

The changed files also contain one ESLint error, unused imports, and trailing
whitespace.

## Goals

- Apply text search and state-change filtering simultaneously.
- Detect transitions whose event sample is inside the selected window,
  including the first in-window sample when it differs from the last
  pre-window sample.
- Return only changed interface IDs from the database instead of materializing
  the full host history in the Next.js process.
- Keep the drawer history limited to the selected window while using a hidden
  pre-window sample as its comparison baseline.
- Scope loading, success, and failure UI to the exact request that produced
  them.
- Make every changed file pass ESLint and `git diff --check`.

## Non-goals

- Adding a persistent state-transition table or schema migration.
- Backfilling a separate event history.
- Changing the State Changes view's 7-day and 30-day options.
- Redesigning the drawer or table.

## Design

### 1. Compose independent filter groups with `AND`

Create a focused helper that builds the `InterfaceSnapshotWhereInput`. Host,
node, and other scalar constraints remain top-level and are implicitly ANDed.
The state-change alternatives form one `OR` group:

```text
lastLinkStChg is inside the window OR id is in detected transition IDs
```

The text-search alternatives form a second `OR` group:

```text
ifName matches OR node matches OR description matches OR dn matches
```

When both groups exist, place them in an `AND` array. Thus a row must qualify
as state-changed and match at least one searchable field. Omit absent groups
instead of emitting empty `AND` or `OR` arrays.

### 2. Detect transitions in PostgreSQL

Add a server-only query helper that returns `string[]` interface IDs. It uses
CTEs and `LAG`:

1. Select interfaces belonging to the chosen APIC host.
2. For each interface, use a lateral indexed lookup to select at most one
   sample immediately before `windowStart`.
3. Union those baseline rows with samples inside the selected window.
4. Partition by `interfaceId`, order by `sampledAt`, and use `LAG` to expose the
   previous admin and operational states.
5. Return distinct interface IDs only where the current sample is inside the
   window, a predecessor exists, and either state differs case-insensitively.

The existing `interfaceId, sampledAt` and `apicHostId, sampledAt` indexes
support the baseline lookup and window scan. The query returns only qualifying
IDs to application memory. `lastLinkStChg` remains a separate qualification
source because it comes directly from APIC rather than sample comparison.

This helper is PostgreSQL-specific, consistent with the production Prisma
schema. SQLite remains limited to the existing migration tooling and is not a
runtime query target.

### 3. Give drawer history a hidden baseline

For a bounded drawer range, fetch the latest sample strictly before the cutoff
alongside the visible ascending samples. A pure serializer accepts the visible
samples and optional baseline, performs transition comparison across the
combined sequence, and removes the baseline from its returned rows. Therefore:

- the first visible sample can be marked as a transition;
- the baseline never appears outside the selected range;
- an interface with no prior sample keeps its first visible sample unmarked.

For the unbounded `all` range, no extra baseline query is needed.

### 4. Key drawer results by request identity

Replace independent loading/data/failure booleans with a small request-result
model keyed by interface ID and range. A pure helper derives the view state:

- no result or a result for another key means `loading`;
- an error applies only when its key matches the active request;
- matching successful data is rendered.

The effect starts the server action and stores success or failure from promise
callbacks; it does not synchronously set state at effect entry. Switching
interface, range, or drawer mode changes the active key, so stale failures can
no longer mask a later request. Existing cancellation guards prevent an older
promise from replacing the active result.

### 5. Cleanup

Remove unused imports and trailing whitespace. The refactored request state
also removes the `react-hooks/set-state-in-effect` violation introduced by the
PR.

## Error handling

- Authentication and missing-interface behavior remain unchanged.
- Database and server-action errors become request-keyed error results in the
  drawer.
- A later request begins in a derived loading state and is not contaminated by
  an earlier error.
- Transition detection treats state values case-insensitively, matching the
  current helpers.

## Testing

Use test-driven development with focused regressions:

- Query-builder tests prove that state and search `OR` groups are nested under
  `AND`, and that absent search does not create an empty group.
- Transition tests prove that a first in-window sample is marked when an
  optional pre-window baseline differs, while the baseline is not returned.
- Request-state tests prove that a failure is visible for its own key and
  becomes loading rather than failed after the request key changes.
- Existing state-change tests continue covering case-insensitive consecutive
  comparisons.
- Run the focused tests after each change, followed by the full Bun suite,
  changed-file ESLint, `git diff --check`, and the production Next.js build.

## Acceptance criteria

- Searching within State Changes never returns a row solely because it matches
  text.
- A transition at the first sample inside a 7-day or 30-day range is detected
  when a predecessor exists.
- The State Changes page does not load all window samples into JavaScript.
- A transient drawer failure does not persist into another request key.
- All tests and the production build pass, and the modified files have no
  ESLint errors or whitespace errors.

## Open questions

None. The database-window approach and `AND` composition were approved.
