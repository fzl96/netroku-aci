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
