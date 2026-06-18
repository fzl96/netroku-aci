'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { INPUT_OVERRIDE_CLS } from '@/lib/ui-classes'

type Credentials = {
  username: string
  password: string
}

export function ApicCredentialDialog({
  open,
  title,
  description,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  title: string
  description: string
  onOpenChange: (open: boolean) => void
  onSubmit: (credentials: Credentials) => Promise<void>
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function close(nextOpen: boolean) {
    if (submitting) return
    if (!nextOpen) {
      setUsername('')
      setPassword('')
    }
    onOpenChange(nextOpen)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!username.trim() || !password) return

    setSubmitting(true)
    try {
      await onSubmit({ username: username.trim(), password })
      setUsername('')
      setPassword('')
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="font-serif text-base font-semibold text-foreground">
            {title}
          </DialogTitle>
          <DialogDescription className="text-xs text-subtle">
            {description}
          </DialogDescription>
        </DialogHeader>
        <form id="apic-credential-form" onSubmit={handleSubmit} className="space-y-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            APIC Username
            <Input
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete="username"
              required
              className={INPUT_OVERRIDE_CLS}
              placeholder="admin"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
            APIC Password
            <Input
              value={password}
              onChange={event => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              required
              className={INPUT_OVERRIDE_CLS}
              placeholder="password"
            />
          </label>
        </form>
        <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
          <button
            type="button"
            onClick={() => close(false)}
            disabled={submitting}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="apic-credential-form"
            disabled={submitting || !username.trim() || !password}
            className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Connecting…' : 'Resync'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
