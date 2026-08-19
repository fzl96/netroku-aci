# Scheduler Timing Consistency Design

## Goal

Keep scheduler configuration, persisted execution deadlines, and the Scheduler page's Last Run and Next Run values consistent when an administrator changes an interval or queues an immediate run.

## Confirmed Failures

Updating an existing schedule persists the new `intervalMinutes` while reusing its old absolute `nextRunAt`. The ticker therefore still observes the old deadline. If a schedule is already running, its claim also carries the old interval into finalization and can overwrite the next deadline after an interval edit.

The Scheduler client initializes local state from server-rendered data, but `Run now` only displays a toast. It neither applies the queued row nor fetches later ticker results, so Last Run and Next Run remain stale until a full page reload.

## Backend Design

Treat the persisted schedule row as the authority.

When an enabled schedule's interval changes, derive its deadline from the last completed run using the new interval. If the schedule has never completed, or the derived deadline has already passed, set `nextRunAt` to the current time so the ticker can claim it immediately. An unchanged interval retains its existing deadline. Disabling still clears `nextRunAt`; re-enabling queues an immediate run.

Finalize a claimed run with one database statement whose `nextRunAt` expression reads the row's current `intervalMinutes`. This prevents a claim made before an administrator's edit from restoring the old cadence. The same statement records completion status and releases `runningAt`.

`Run now` continues to mean "queue immediately" rather than execute synchronously. After updating `nextRunAt`, the action returns the safe updated schedule so the client can show the queued state without guessing.

## UI and Data Flow

Keep the existing local schedule array so edit and toggle actions remain responsive. Add a non-cached authenticated refresh action and poll it every ten seconds while the Scheduler page is mounted. Each successful refresh replaces the array; a transient refresh error preserves the last good view and retries on the next interval rather than showing repeated toasts.

After `Run now` succeeds, replace that row immediately with the action response. Subsequent polling observes `runningAt`, completion, `lastRunAt`, status, detail, and the newly calculated deadline. Polling also keeps autonomous background runs accurate when the page was already open.

The existing relative-time formatter will reevaluate whenever refreshed data is applied, so no separate clock state is required for this fix.

## Concurrency and Error Handling

Interval edits remain allowed during a run. Finalization reads the latest interval atomically, so the edit determines the next cadence without corrupting the completion record.

If a schedule is deleted while running, finalization may still find no row; the ticker's existing failure handling remains responsible for that case. Polling is read-only, authenticated like the page load, and stops when the component unmounts.

## Testing

Use red-green TDD at the real behavior seams:

- an existing 1h schedule changed to 4h receives a deadline four hours after its last completion;
- shortening an interval whose derived deadline is already past queues the schedule now;
- changing non-timing fields without changing the interval preserves the existing deadline;
- a run claimed at 1h but edited to 4h before finalization schedules its next run at completion plus four hours using PostgreSQL;
- `Run now` returns the updated safe row;
- the client refresh loop applies successful snapshots, preserves data on refresh failure, and stops after disposal.

After focused tests pass, run the scheduler suite, the full Bun suite, changed-file ESLint, `git diff --check`, and the production build.
