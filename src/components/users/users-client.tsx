'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { IconShieldCheck, IconTrash, IconUser, IconUserPlus, IconUsers } from '@tabler/icons-react'
import { createUser, deleteUser } from '@/lib/users/actions'
import type { SafeUser } from '@/lib/users/query'
import { DENSE_TABLE_HEAD_CLS, INPUT_CLS, SELECT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function RoleBadge({ role }: { role: SafeUser['role'] }) {
  const admin = role === 'admin'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.08em] uppercase',
        admin
          ? 'border-primary/25 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground',
      ].join(' ')}
    >
      {admin ? <IconShieldCheck size={11} stroke={1.75} /> : <IconUser size={11} stroke={1.75} />}
      {role}
    </span>
  )
}

export function UsersClient({
  initialUsers,
  currentUserId,
}: {
  initialUsers: SafeUser[]
  currentUserId: string
}) {
  const [users, setUsers] = useState(initialUsers)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'admin' | 'member'>('member')
  const [pending, setPending] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deletingUser, setDeletingUser] = useState<SafeUser | null>(null)

  const adminCount = users.filter((user) => user.role === 'admin').length
  const memberCount = users.filter((user) => user.role === 'member').length

  function resetForm() {
    setUsername('')
    setPassword('')
    setRole('member')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    const result = await createUser({ username, password, role })
    setPending(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setUsers((prev) => [result.data, ...prev])
    resetForm()
    setCreateOpen(false)
    toast.success(`Created ${result.data.username}`)
  }

  async function handleDelete() {
    if (!deletingUser) return
    setPending(true)
    const result = await deleteUser(deletingUser.id)
    setPending(false)

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setUsers((prev) => prev.filter((user) => user.id !== deletingUser.id))
    setDeleteOpen(false)
    setDeletingUser(null)
    toast.success(`Deleted ${deletingUser.username}`)
  }

  return (
    <>
      <div className="space-y-6 px-8 py-6">
        <div className="flex justify-end">
          <button
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <IconUserPlus size={12} stroke={1.75} />
            Create User
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="animate-fade-up rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-[11px] text-subtle">Total Users</p>
            <p className="mt-2 font-serif text-[28px] leading-none font-semibold text-foreground tabular-nums">
              {users.length}
            </p>
            <p className="mt-1.5 text-[11px] text-faint">active application accounts</p>
          </div>
          <div className="animate-fade-up rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-[11px] text-subtle">Admins</p>
            <p className="mt-2 font-serif text-[28px] leading-none font-semibold text-foreground tabular-nums">
              {adminCount}
            </p>
            <p className="mt-1.5 text-[11px] text-faint">can manage hosts and users</p>
          </div>
          <div className="animate-fade-up rounded-xl border border-border bg-card px-5 py-4">
            <p className="text-[11px] text-subtle">Members</p>
            <p className="mt-2 font-serif text-[28px] leading-none font-semibold text-foreground tabular-nums">
              {memberCount}
            </p>
            <p className="mt-1.5 text-[11px] text-faint">can use shared APIC hosts</p>
          </div>
        </div>

        <div className="animate-fade-up overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['User', 'Role', 'Created', ''].map((header) => (
                    <th key={header} className={DENSE_TABLE_HEAD_CLS}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-14 text-center">
                      <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-muted">
                        <IconUsers size={18} stroke={1.5} className="text-faint" />
                      </div>
                      <p className="text-sm text-subtle">No users yet</p>
                      <p className="mt-1 text-xs text-faint">Create an account to allow sign-in.</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr
                      key={user.id}
                      className="group animate-fade-up border-b border-border-faint transition-colors duration-100 last:border-0 hover:bg-muted"
                      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
                    >
                      <td className="border-l-2 border-l-transparent px-4 py-2.5 transition-colors duration-100 group-hover:border-l-primary">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-muted text-[11px] font-semibold text-muted-foreground uppercase">
                            {user.displayUsername.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {user.displayUsername}
                            </div>
                            <div className="truncate text-[11px] text-faint">{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-2.5 text-subtle tabular-nums">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {user.id !== currentUserId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => {
                              setDeletingUser(user)
                              setDeleteOpen(true)
                            }}
                            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-error/10 hover:text-error"
                            aria-label={`Delete ${user.displayUsername}`}
                          >
                            <IconTrash size={14} stroke={1.75} />
                          </Button>
                        ) : (
                          <span className="text-[10px] text-faint">Current</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) resetForm()
          setCreateOpen(open)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              Create User
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Create a local account and choose the application role.
            </DialogDescription>
          </DialogHeader>

          <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={INPUT_CLS}
                minLength={3}
                maxLength={30}
                required
                autoComplete="username"
                autoFocus
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className={INPUT_CLS}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-foreground">
              Role
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as 'admin' | 'member')}
                className={SELECT_CLS}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </form>

          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end gap-1 rounded-b-xl border-t border-subtle bg-muted px-4 py-3">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={pending}
              className="px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-user-form"
              disabled={pending}
              className="rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? 'Creating…' : 'Create User'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) setDeletingUser(null)
          setDeleteOpen(open)
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingUser?.displayUsername}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This permanently removes the user account, sessions, and linked sign-in data. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end gap-1 rounded-b-xl border-t border-subtle bg-muted px-4 py-3">
            <AlertDialogCancel
              disabled={pending}
              className="border-0 bg-transparent px-4 py-2 text-sm text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
              className="rounded-lg bg-error px-5 py-2 text-sm font-semibold text-error-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
