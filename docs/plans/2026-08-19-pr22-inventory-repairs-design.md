# PR #22 Inventory Repairs Design

## Goal

Make PR #22 build cleanly and satisfy its inventory-management specification without broadening the subsystem or undertaking the optional code-smell refactors.

## Scope

The repair covers:

- dynamic rack capacity during CSV import;
- exactly one master for every non-empty device stack;
- batch-import audit history integration;
- duplicate alias-header detection in CSV files;
- debounced live device search;
- PR-local TypeScript and lint failures.

The six Standards-axis smell findings remain follow-up refactoring unless a small extraction is required to implement these correctness fixes safely.

## Architecture

Keep the existing Next.js server-action and Prisma transaction architecture. Add small, pure inventory-domain helpers for decisions that need deterministic tests, then call those helpers from the existing mutation paths.

Dynamic rack provisioning derives each new rack's height from its valid import rows. The height is `max(42, highest occupied unit)` and may not exceed 60U. Validation and execution use the same derived plan so previewed capacity matches persisted capacity.

Stack mutations preserve an existing master. If a non-empty stack has no master after a create, update, delete, or import operation, the transaction promotes the candidate with the lowest switch number. Missing switch numbers sort after numbered members; name and ID provide deterministic tie-breakers. The invariant is repaired before the transaction completes.

## UI and Data Flow

Device search follows the repository's existing Nodes and History pattern: update the input immediately, debounce navigation for 300 ms, reset to page one, and use `router.replace` inside a transition. A dispatched-query guard prevents refreshed server props from overwriting in-flight typing.

`DeviceForm` derives the stack selector from `deviceStackName`: `null` is no stack, an empty or unmatched value is new-stack mode, and a matching name is an existing stack. This removes the effect that synchronously updated local state.

CSV repeated-header detection resolves cell values through the same alias map used for file headers. A row whose required identity cells resolve back to their canonical fields is skipped regardless of whether it uses `hostname/serial_number` or aliases such as `name/sn`.

## Error Handling

Imports reject placements whose top occupied unit exceeds 60U. Valid rows targeting a new rack between U43 and U60 create a rack large enough to contain them. Existing-rack collision and capacity errors remain unchanged.

Stack mutations do not fail merely because the current master leaves; they promote the deterministic successor automatically. Empty stacks continue to be deleted by existing cleanup behavior.

## Audit and Build Repairs

Add `device.import` to `AuditAction` and `HISTORY_ACTION_LABELS`, making import events type-safe, searchable, and filterable. Return the declared `pageSize` from `getDevices`, replace the malformed-row `any` with its domain type, and remove unused inventory variables/state.

## Testing

Use red-green TDD for each behavior:

- a dynamically provisioned rack grows through 60U and rejects placements beyond 60U;
- master selection preserves an existing master and otherwise promotes the lowest-numbered member;
- canonical and alias repeated-header rows are skipped;
- import audit actions appear in history labels and filters;
- device-search navigation is debounced and resets pagination;
- stack-selector derivation covers none, new, and existing modes.

After focused tests pass, run the full Bun suite, changed-file ESLint, `git diff --check`, and `bun run build`.
