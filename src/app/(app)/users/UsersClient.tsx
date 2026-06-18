'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { IconShieldCheck, IconTrash, IconUser, IconUserPlus, IconUsers } from '@tabler/icons-react'
import { createUser, deleteUser, type SafeUser } from '@/actions/users'
import {
  DENSE_TABLE_HEAD_CLS,
  INPUT_CLS,
  SELECT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'
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
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]',
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

  const adminCount = users.filter(user => user.role === 'admin').length
  const memberCount = users.filter(user => user.role === 'member').length

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

    setUsers(prev => [result.data, ...prev])
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

    setUsers(prev => prev.filter(user => user.id !== deletingUser.id))
    setDeleteOpen(false)
    setDeletingUser(null)
    toast.success(`Deleted ${deletingUser.username}`)
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Users</h1>
            <p className="text-xs text-subtle mt-0.5">Manage application access and roles</p>
          </div>
          <button
            onClick={() => {
              resetForm()
              setCreateOpen(true)
            }}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <IconUserPlus size={12} stroke={1.75} />
            Create User
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Total Users</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {users.length}
            </p>
            <p className="text-[11px] text-faint mt-1.5">active application accounts</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Admins</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {adminCount}
            </p>
            <p className="text-[11px] text-faint mt-1.5">can manage hosts and users</p>
          </div>
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Members</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {memberCount}
            </p>
            <p className="text-[11px] text-faint mt-1.5">can use shared APIC hosts</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['User', 'Role', 'Created', ''].map(header => (
                    <th
                      key={header}
                      className={DENSE_TABLE_HEAD_CLS}
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-14 text-center">
                      <div className="mx-auto mb-4 h-10 w-10 rounded-xl bg-muted border border-border flex items-center justify-center">
                        <IconUsers size={18} stroke={1.5} className="text-faint" />
                      </div>
                      <p className="text-sm text-subtle">No users yet</p>
                      <p className="text-xs text-faint mt-1">Create an account to allow sign-in.</p>
                    </td>
                  </tr>
                ) : (
                  users.map((user, index) => (
                    <tr
                      key={user.id}
                      className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
                    >
                      <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-muted border border-border flex items-center justify-center text-[11px] font-semibold text-muted-foreground uppercase">
                            {user.displayUsername.slice(0, 1)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{user.displayUsername}</div>
                            <div className="text-[11px] text-faint truncate">{user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-subtle">
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
                            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-error hover:bg-error/10 transition-opacity"
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

      <Dialog open={createOpen} onOpenChange={open => {
        if (!open) resetForm()
        setCreateOpen(open)
      }}>
        <DialogContent className="bg-card border-border text-foreground">
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
                onChange={event => setUsername(event.target.value)}
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
                onChange={event => setPassword(event.target.value)}
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
                onChange={event => setRole(event.target.value as 'admin' | 'member')}
                className={SELECT_CLS}
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </form>

          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={pending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-user-form"
              disabled={pending}
              className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {pending ? 'Creating…' : 'Create User'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={open => {
        if (!open) setDeletingUser(null)
        setDeleteOpen(open)
      }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingUser?.displayUsername}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This permanently removes the user account, sessions, and linked sign-in data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel
              disabled={pending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
              className="bg-error text-error-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {pending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
