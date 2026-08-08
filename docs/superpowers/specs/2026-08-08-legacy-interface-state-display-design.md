# Legacy Interface State Display Design

## Goal

Make the Admin and Oper columns in the Legacy Interfaces table match the ACI Interfaces presentation while reducing device-specific state strings to the binary labels `up` and `down`. Remove Speed from the table and its visible sort choices without removing speed data from interface details or history.

## Scope

This change applies only to the Legacy Interfaces list presentation at `/legacy/interfaces`:

- Normalize the Admin and Oper values shown in the desktop table.
- Normalize the Oper indicator shown on mobile interface cards.
- Remove the desktop Speed column.
- Remove Speed from the sort dropdown.

The following behavior remains unchanged:

- Raw state values stored in PostgreSQL.
- Admin and Oper filter values and filtering behavior.
- Server-side sort support for existing `?sort=speed` URLs.
- Interface summary counts.
- Raw Admin, Oper, and Speed values in the detail drawer and history.
- Counter display, pagination, search, presence, device, and site filtering.

## State Normalization

Add a pure `normalizeLegacyInterfaceState(value)` helper to the Legacy interface UI helpers. It returns `up` only when the trimmed input equals `up`, case-insensitively. Every other value returns `down`.

Examples:

| Raw value | Table value |
| --- | --- |
| `up`, `UP`, ` up ` | `up` |
| `down` | `down` |
| `notconnect` | `down` |
| `administratively down` | `down` |
| `disabled` | `down` |
| empty or unknown text | `down` |

This intentionally creates an operational summary for the table without altering the source data used elsewhere.

## Presentation

The Admin column follows the ACI table's Admin treatment: plain muted text containing only `up` or `down`.

The Oper column follows the ACI table's operational-state treatment:

- `up`: compact green dot and green `up` text, without a pill background.
- `down`: compact red dot and red `down` text inside a pale red outlined pill.

The same normalized Oper indicator is used as the trailing status on mobile interface cards. Status remains understandable without color because the text label is always present.

The Speed header and cell are removed from the desktop table. The Speed option is removed from the sort dropdown so the UI does not offer sorting on an invisible column. Existing speed-sort query parameters remain accepted to avoid breaking bookmarked URLs.

## Component Boundaries

The pure normalization helper lives in `src/lib/legacy-ui/interfaces.ts` so its behavior can be tested without React rendering. The Legacy Interfaces client owns the small display component that applies the ACI-matching classes. The working ACI page is not refactored as part of this change, keeping the regression surface limited to Legacy.

## Error and Edge-Case Behavior

Missing, blank, malformed, or unfamiliar state strings display as `down`, satisfying the requirement that the table show exactly one of the two states. Absent interfaces use the same binary state presentation; their separate `Absent` marker remains visible beside the interface name.

## Testing and Verification

Use test-driven development for the normalization helper:

1. Add failing unit assertions for case-insensitive `up`, surrounding whitespace, representative down-like values, blank input, and unknown input.
2. Implement the smallest helper that passes those assertions.
3. Update the Legacy table and mobile card rendering, then remove the Speed column and visible sort option.
4. Run the focused Legacy interface helper tests and lint the touched files.
5. Render `/legacy/interfaces` and verify Admin and Oper presentation, binary labels, column alignment after Speed removal, and the mobile Oper indicator.
