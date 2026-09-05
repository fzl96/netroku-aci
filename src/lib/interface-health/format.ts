// Timestamp formatting shared by every interface-health surface. Sample times
// are ISO strings from the query layer; both helpers accept null so callers can
// hand over an unpopulated column directly.

export function fmtDate(date: string | null): string {
  if (!date) return '—'
  return new Date(date).toLocaleString()
}

/** Coarse age of a timestamp — minutes, then hours to two days, then days.
 *  Deliberately imprecise: it answers "recent or stale?", and `fmtDate` is
 *  alongside it wherever the exact moment matters. */
export function fmtRelative(date: string | null): string {
  if (!date) return 'never'
  const ms = Date.now() - new Date(date).getTime()
  if (ms < 60_000) return 'just now'
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 48) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  return `${day}d ago`
}
