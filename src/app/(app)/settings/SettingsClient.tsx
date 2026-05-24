'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { IconKey, IconShieldCheck, IconUser } from '@tabler/icons-react'
import { authClient } from '@/lib/auth-client'
import { INPUT_CLS } from '@/lib/ui-classes'

export function SettingsClient({
  username,
  role,
}: {
  username: string
  role: 'admin' | 'member'
}) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match')
      return
    }

    setPending(true)
    const { error } = await authClient.changePassword({
      currentPassword,
      newPassword,
      revokeOtherSessions: true,
    })
    setPending(false)

    if (error) {
      toast.error(error.message ?? 'Failed to change password')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    toast.success('Password changed')
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Settings</h1>
            <p className="text-xs text-subtle mt-0.5">Manage your account password</p>
          </div>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-2 gap-4 max-w-3xl">
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Signed In As</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-muted border border-border flex items-center justify-center">
                <IconUser size={14} stroke={1.75} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">{username}</p>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Role</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-muted border border-border flex items-center justify-center">
                <IconShieldCheck size={14} stroke={1.75} className="text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground capitalize">{role}</p>
            </div>
          </div>
        </div>

        <section className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up max-w-3xl">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-muted border border-border flex items-center justify-center">
              <IconKey size={15} stroke={1.75} className="text-muted-foreground" />
            </div>
            <div>
              <h2 className="font-serif text-base font-semibold text-foreground">Change Password</h2>
              <p className="text-xs text-subtle mt-0.5">Update the password used to sign in to this app.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Current Password
              <input
                value={currentPassword}
                onChange={event => setCurrentPassword(event.target.value)}
                type="password"
                className={INPUT_CLS}
                required
                autoComplete="current-password"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
                New Password
                <input
                  value={newPassword}
                  onChange={event => setNewPassword(event.target.value)}
                  type="password"
                  className={INPUT_CLS}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
                Confirm New Password
                <input
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  type="password"
                  className={INPUT_CLS}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
              </label>
            </div>

            <div className="flex justify-end border-t border-border pt-4">
              <button
                type="submit"
                disabled={pending}
                className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {pending ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  )
}
