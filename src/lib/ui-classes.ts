// Canonical CSS class constants — import from here, never re-define locally.

// Raw <input> / <textarea>
export const INPUT_CLS =
  'w-full bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg px-3 py-2 ' +
  'text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-colors'

// <select> — same as INPUT_CLS + cursor
export const SELECT_CLS = `${INPUT_CLS} cursor-pointer`

// Search <input> — compact, left-icon padding (caller adds icon + pl-8)
export const SEARCH_INPUT_CLS =
  'w-full bg-[var(--surface-alt)] border border-[var(--border)] rounded-lg pl-8 pr-3 py-1.5 ' +
  'text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] outline-none ' +
  'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15 transition-colors'

// shadcn <Input> component className prop — overrides base styles only
export const INPUT_OVERRIDE_CLS =
  'border-[var(--border)] bg-[var(--surface-alt)] text-[var(--text)] text-sm ' +
  'placeholder:text-[var(--text-faint)] ' +
  'focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent)]/15'

// Form section label (uppercase tracking)
export const LABEL_CLS =
  'block text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5'
