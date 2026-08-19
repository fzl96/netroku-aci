export function FooterCancel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
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
      className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}
