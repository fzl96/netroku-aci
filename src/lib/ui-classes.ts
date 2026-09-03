// Canonical CSS class constants — import from here, never re-define locally.

// Raw <input> / <textarea>
export const INPUT_CLS =
  'w-full bg-muted border border-border rounded-lg px-3 py-2 ' +
  'text-sm text-foreground placeholder:text-faint outline-none ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors'

// <select> — same as INPUT_CLS + cursor
export const SELECT_CLS = `${INPUT_CLS} cursor-pointer`

// Search <input> — compact, left-icon padding (caller adds icon + pl-8)
export const SEARCH_INPUT_CLS =
  'w-full bg-muted border border-border rounded-lg pl-8 pr-3 py-1.5 ' +
  'text-xs text-foreground placeholder:text-faint outline-none ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors'

// shadcn <Input> component className prop — overrides base styles only
export const INPUT_OVERRIDE_CLS =
  'border-border bg-muted text-foreground text-sm ' +
  'placeholder:text-faint ' +
  'focus-visible:border-primary focus-visible:ring-primary/15'

// Form section label (uppercase tracking)
export const LABEL_CLS =
  'block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5'

// App shell <main> — the region beside the sidebar.
// No overflow here: `main` stretches to its content height (its flex parent is
// only `min-h-svh`), so a scrollport on it never scrolls the page, it just
// shadows the window's. On phones the `min-h-full` page wrapper sits below the
// `h-14` MobileTopBar, leaving the scrollport exactly 56px short — a swipe
// latches onto it, moves 56px and dead-ends at the table toolbar. The window is
// the page scrollport; `md:sticky` headers pin against it.
// `min-w-0` is load-bearing: a flex item's automatic minimum size is its
// content's min-content width, and the overflow that used to be here zeroed
// that out as a side effect. Without it a wide table row holds `main` open past
// the sidebar and the whole page scrolls sideways.
export const APP_MAIN_CLS = 'min-w-0 flex-1 bg-background'

// Table wrappers and headers
// Height cap only from md up: on phones a capped box becomes a nested scroll
// region that traps the page, leaving the page header stranded on screen.
// Phones also pin overflow-y to hidden. Uncapped the box already fits its rows,
// but a wide table's horizontal scrollbar eats box height, leaving a few px of
// vertical travel — enough for a swipe to latch onto. Nothing is clipped: with
// no max-height there is no vertical overflow to lose.
export const TABLE_SCROLL_CLS =
  'relative overflow-x-auto overflow-y-hidden ' + 'md:overflow-auto md:max-h-[calc(100vh-14rem)]'

export const DENSE_TABLE_HEAD_CLS =
  'md:sticky md:top-0 z-10 bg-card text-left px-4 pt-3 pb-2.5 ' +
  'text-[9px] font-semibold uppercase tracking-[0.12em] text-faint ' +
  'whitespace-nowrap border-b border-border'

export const MUTED_TABLE_HEAD_CLS =
  'md:sticky md:top-0 z-10 bg-muted text-left px-4 py-2.5 ' +
  'text-[10px] uppercase tracking-wide font-semibold text-subtle whitespace-nowrap'

export const DASHBOARD_TABLE_HEAD_CLS = 'md:sticky md:top-0 z-10 bg-card font-medium'
