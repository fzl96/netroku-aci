# Interface Health Counter Mode Design

## Goal
Add a compact toggle on the Interface Health page that switches the table between the latest raw APIC counters and the already-supported deltas, while keeping Delta as the default view.

## Chosen shape
Use one table with one mode switch: `Delta` and `Current`. The columns stay in the same positions so scanning remains familiar; only the headers and values change with the selected mode. Delta mode keeps the existing labels such as `Rx err Δ`; Current mode uses plain labels such as `Rx err`.

## Data flow
The database already stores both raw counters and derived deltas for each `InterfaceSample`. The page loader should fetch both sets from the latest sample and serialize them into the row props. The client toggle should choose which set to render locally, so switching modes needs no new APIC call, no new database query, and no URL navigation.

## Edge cases
On the first sync, Delta mode may still show `—` because there is no previous sample. Current mode should show the raw latest values immediately. Existing highlight behavior should apply to whichever values are visible.

## Testing
Add a small pure helper for selecting the visible counter fields by mode and test both modes. Then verify the page still lints/builds after wiring the helper into the client component and adding raw-counter fields to the server query.
