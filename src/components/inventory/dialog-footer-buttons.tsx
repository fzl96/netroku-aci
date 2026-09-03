export function FooterCancel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
    >
      Cancel
    </button>
  )
}

export function FooterSubmit({
  form,
  onClick,
  disabled,
  label,
}: {
  form?: string
  onClick?: () => void
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type={form ? 'submit' : 'button'}
      form={form}
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {label}
    </button>
  )
}
