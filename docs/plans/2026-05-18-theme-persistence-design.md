# Theme Persistence Design

## Goal
Persist the existing two-state light/dark theme choice across refreshes without changing the visible control model.

## Current behavior
`src/components/ThemeProvider.tsx` owns theme state locally, toggles the `dark` class on `<html>`, and writes `localStorage.theme` when the user clicks the switcher. On a fresh page load it does not read that stored value; it only inspects the already-rendered `<html>` class, which starts light, so refreshes fall back to light mode.

## Chosen approach
Replace the custom provider with `next-themes` and keep the app intentionally binary:
- `attribute="class"` so existing Tailwind/dark styles continue to use the `dark` class.
- `defaultTheme="light"` to preserve the app's current first-visit behavior.
- `enableSystem={false}` so the UI remains light/dark only rather than introducing a third system state.
- `disableTransitionOnChange` to avoid a distracting global animation when toggling.

The sidebar will keep the same moon/sun control, but it will read `resolvedTheme` and call `setTheme(...)` from `next-themes` instead of depending on the removed custom context. The root `<html>` element will add `suppressHydrationWarning`, matching the library guidance because `next-themes` mutates that element before hydration.

## Testing
There is no existing app test harness for browser persistence. Add a tiny pure helper for binary theme switching and cover it with Node's built-in test runner, then verify the integration with lint/build. Manual browser verification: choose dark mode, refresh, and confirm the page remains dark.
