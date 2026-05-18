# Public Root Route Design

## Goal

Keep `/` fully public while preserving the existing authentication behavior for every other matched page route.

## Chosen approach

Keep the proxy matcher broad and make `/` an explicit public route inside `src/proxy.ts`. This keeps the policy readable in ordinary TypeScript rather than hiding the exception inside a negative-lookahead regex.

## Behavior

- Signed-out requests to `/` continue without redirect.
- Signed-out requests to protected routes such as `/apic-hosts` still redirect to `/signin`.
- Signed-in requests to `/signin` and `/signup` still redirect to `/`.

## Testing

Add focused proxy coverage around the public-root exception and the existing protected-route redirect behavior so future routing edits do not quietly close the public front door again.
