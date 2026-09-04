export function OperStBadge({ st, adminSt }: { st: string; adminSt?: string }) {
  const up = st.toLowerCase() === 'up'
  const adminUp = adminSt?.toLowerCase() === 'up'
  const operDown = !up && (adminUp || st.length > 0)

  if (operDown) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        {st || 'down'}
      </span>
    )
  }

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 text-[10px] font-medium',
        up ? 'text-success' : st ? 'text-faint' : 'text-muted-foreground',
      ].join(' ')}
    >
      <span
        className={['h-1.5 w-1.5 shrink-0 rounded-full', up ? 'bg-success-dot' : 'bg-border'].join(
          ' ',
        )}
      />
      {st || '—'}
    </span>
  )
}
