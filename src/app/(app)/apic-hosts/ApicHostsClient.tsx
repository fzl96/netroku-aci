'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  IconPlus,
  IconPencil,
  IconTrash,
} from '@tabler/icons-react'
import type { ApicHost } from '@prisma/client'

import {
  createApicHost,
  updateApicHost,
  deleteApicHost,
} from '@/actions/apic-hosts'
import { apicHostSchema, type ApicHostFormValues } from '@/lib/schemas/apic-host'

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT_CLS =
  'border-[var(--border)] bg-[var(--surface-alt)] text-[var(--text)] text-sm ' +
  'placeholder:text-[var(--text-faint)] ' +
  'focus-visible:border-[var(--accent)] focus-visible:ring-[var(--accent)]/15'

// ─── Shared form ─────────────────────────────────────────────────────────────

function ApicHostForm({
  form,
  onSubmit,
  formId,
}: {
  form: ReturnType<typeof useForm<ApicHostFormValues>>
  onSubmit: (data: ApicHostFormValues) => void
  formId: string
}) {
  return (
    <Form {...form}>
      <form id={formId} onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-[var(--text)]">
                Display Name
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Production APIC"
                  autoFocus
                  className={INPUT_CLS}
                  {...field}
                />
              </FormControl>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="host"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs font-medium text-[var(--text)]">
                Host / IP Address
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="10.0.0.1 or apic.example.com"
                  className={`${INPUT_CLS} font-mono`}
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-[11px] text-[var(--text-subtle)]">
                IP address or fully qualified hostname of the APIC controller
              </FormDescription>
              <FormMessage className="text-xs" />
            </FormItem>
          )}
        />
      </form>
    </Form>
  )
}

// ─── Dialog footer buttons ────────────────────────────────────────────────────

function FooterCancel({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-4 py-2 disabled:opacity-50"
    >
      Cancel
    </button>
  )
}

function FooterSubmit({ form, onClick, disabled, label }: {
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
      className="bg-[var(--accent)] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ApicHostsClient({ initialHosts }: { initialHosts: ApicHost[] }) {
  const [hosts, setHosts] = useState<ApicHost[]>(initialHosts)
  const [isPending, setIsPending] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editingHost, setEditingHost] = useState<ApicHost | null>(null)
  const [deletingHost, setDeletingHost] = useState<ApicHost | null>(null)

  const createForm = useForm<ApicHostFormValues>({
    resolver: zodResolver(apicHostSchema),
    defaultValues: { name: '', host: '' },
  })

  const editForm = useForm<ApicHostFormValues>({
    resolver: zodResolver(apicHostSchema),
    defaultValues: { name: '', host: '' },
  })

  function openEdit(host: ApicHost) {
    setEditingHost(host)
    editForm.reset({ name: host.name, host: host.host })
    setEditOpen(true)
  }

  function openDelete(host: ApicHost) {
    setDeletingHost(host)
    setDeleteOpen(true)
  }

  async function handleCreate(data: ApicHostFormValues) {
    setIsPending(true)
    const result = await createApicHost(data)
    setIsPending(false)
    if (result.success) {
      setHosts(prev => [result.data, ...prev])
      createForm.reset()
      setCreateOpen(false)
    } else {
      toast.error(result.error)
    }
  }

  async function handleUpdate(data: ApicHostFormValues) {
    if (!editingHost) return
    setIsPending(true)
    const result = await updateApicHost(editingHost.id, data)
    setIsPending(false)
    if (result.success) {
      setHosts(prev => prev.map(h => h.id === editingHost.id ? result.data : h))
      setEditOpen(false)
      setEditingHost(null)
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    if (!deletingHost) return
    setIsPending(true)
    const result = await deleteApicHost(deletingHost.id)
    setIsPending(false)
    if (result.success) {
      setHosts(prev => prev.filter(h => h.id !== deletingHost.id))
      setDeleteOpen(false)
      setDeletingHost(null)
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="min-h-full bg-[var(--bg)]">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-[var(--text)]">APIC Hosts</h1>
            <p className="text-xs text-[var(--text-subtle)] mt-0.5">Manage APIC controller endpoints</p>
          </div>
          <button
            onClick={() => {
              createForm.reset()
              setCreateOpen(true)
            }}
            className="flex items-center gap-1.5 bg-[var(--accent)] text-white text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
          >
            <IconPlus size={11} stroke={1.75} />
            Add Host
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-[var(--text-subtle)]">Total Hosts</p>
            <p className="text-[28px] font-semibold text-[var(--text)] leading-none mt-2 font-serif tabular-nums">
              {hosts.length}
            </p>
            <p className="text-[11px] text-[var(--text-faint)] mt-1.5">registered controllers</p>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-light)] bg-[var(--surface-alt)]">
                  {['Name', 'Host', 'Added', ''].map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wide font-semibold text-[var(--text-subtle)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hosts.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-14 text-center">
                      <p className="text-sm text-[var(--text-subtle)]">No APIC hosts yet</p>
                      <p className="text-xs text-[var(--text-faint)] mt-1">
                        Add your first controller endpoint to get started
                      </p>
                    </td>
                  </tr>
                ) : (
                  hosts.map(host => (
                    <tr
                      key={host.id}
                      className="border-b border-[var(--border-lighter)] last:border-0 hover:bg-[var(--surface-alt)] transition-colors group"
                    >
                      <td className="px-4 py-3 font-medium text-[var(--text)]">{host.name}</td>
                      <td className="px-4 py-3 font-mono text-[var(--text-muted)]">{host.host}</td>
                      <td className="px-4 py-3 text-[var(--text-subtle)]">
                        {new Date(host.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openEdit(host)}
                            title="Edit"
                          >
                            <IconPencil size={13} stroke={1.75} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => openDelete(host)}
                            title="Delete"
                            className="text-[var(--text-faint)] hover:text-destructive"
                          >
                            <IconTrash size={13} stroke={1.75} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={open => {
        if (!open) createForm.reset()
        setCreateOpen(open)
      }}>
        <DialogContent className="bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-[var(--text)]">
              Add APIC Host
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-subtle)]">
              Register a new APIC controller endpoint.
            </DialogDescription>
          </DialogHeader>
          <ApicHostForm form={createForm} onSubmit={handleCreate} formId="create-host-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-[var(--border-light)] bg-[var(--surface-alt)] px-4 py-3 gap-1">
            <FooterCancel onClick={() => setCreateOpen(false)} disabled={isPending} />
            <FooterSubmit
              form="create-host-form"
              onClick={createForm.handleSubmit(handleCreate)}
              disabled={isPending}
              label={isPending ? 'Adding…' : 'Add Host'}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={open => {
        if (!open) setEditingHost(null)
        setEditOpen(open)
      }}>
        <DialogContent className="bg-[var(--surface)] border-[var(--border)] text-[var(--text)]">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-[var(--text)]">
              Edit APIC Host
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--text-subtle)]">
              Update the controller endpoint details.
            </DialogDescription>
          </DialogHeader>
          <ApicHostForm form={editForm} onSubmit={handleUpdate} formId="edit-host-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-[var(--border-light)] bg-[var(--surface-alt)] px-4 py-3 gap-1">
            <FooterCancel onClick={() => setEditOpen(false)} disabled={isPending} />
            <FooterSubmit
              onClick={editForm.handleSubmit(handleUpdate)}
              disabled={isPending}
              label={isPending ? 'Saving…' : 'Save Changes'}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={open => {
        if (!open) setDeletingHost(null)
        setDeleteOpen(open)
      }}>
        <AlertDialogContent className="bg-[var(--surface)] border-[var(--border)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-[var(--text)]">
              Delete &ldquo;{deletingHost?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-[var(--text-subtle)]">
              This will permanently remove the APIC host. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-[var(--border-light)] bg-[var(--surface-alt)] px-4 py-3 gap-1">
            <AlertDialogCancel
              disabled={isPending}
              className="text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="bg-[var(--error-text)] text-white text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
