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

import {
  createApicHost,
  updateApicHost,
  deleteApicHost,
  type SafeApicHost,
} from '@/actions/apic-hosts'
import { apicHostSchema, apicHostUpdateSchema, type ApicHostFormValues, type ApicHostUpdateFormValues } from '@/lib/schemas/apic-host'

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
import {
  DENSE_TABLE_HEAD_CLS,
  INPUT_OVERRIDE_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'

// ─── Shared form ─────────────────────────────────────────────────────────────

function ApicHostForm({
  form,
  onSubmit,
  formId,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: ReturnType<typeof useForm<any>>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: any) => void
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
              <FormLabel className="text-xs font-medium text-foreground">
                Display Name
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="Production APIC"
                  autoFocus
                  className={INPUT_OVERRIDE_CLS}
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
              <FormLabel className="text-xs font-medium text-foreground">
                Host / IP Address
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="10.0.0.1 or apic.example.com"
                  className={`${INPUT_OVERRIDE_CLS} font-mono`}
                  {...field}
                />
              </FormControl>
              <FormDescription className="text-[11px] text-subtle">
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
      className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-50"
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
      className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {label}
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ApicHostsClient({ initialHosts }: { initialHosts: SafeApicHost[] }) {
  const [hosts, setHosts] = useState<SafeApicHost[]>(initialHosts)
  const [isPending, setIsPending] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editingHost, setEditingHost] = useState<SafeApicHost | null>(null)
  const [deletingHost, setDeletingHost] = useState<SafeApicHost | null>(null)

  const createForm = useForm<ApicHostFormValues>({
    resolver: zodResolver(apicHostSchema),
    defaultValues: { name: '', host: '' },
  })

  const editForm = useForm<ApicHostUpdateFormValues>({
    resolver: zodResolver(apicHostUpdateSchema),
    defaultValues: { name: '', host: '' },
  })

  function openEdit(host: SafeApicHost) {
    setEditingHost(host)
    editForm.reset({ name: host.name, host: host.host })
    setEditOpen(true)
  }

  function openDelete(host: SafeApicHost) {
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

  async function handleUpdate(data: ApicHostUpdateFormValues) {
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
    <div className="min-h-full bg-background">
      {/* Page header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">APIC Hosts</h1>
            <p className="text-xs text-subtle mt-0.5">Manage shared APIC controller endpoints</p>
          </div>
          <button
            onClick={() => {
              createForm.reset()
              setCreateOpen(true)
            }}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
          >
            <IconPlus size={11} stroke={1.75} />
            Add Host
          </button>
        </div>
      </div>

      <div className="px-8 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl px-5 py-4 animate-fade-up">
            <p className="text-[11px] text-subtle">Total Hosts</p>
            <p className="text-[28px] font-semibold text-foreground leading-none mt-2 font-serif tabular-nums">
              {hosts.length}
            </p>
            <p className="text-[11px] text-faint mt-1.5">registered controllers</p>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm animate-fade-up">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Name', 'Host', 'Added', ''].map(h => (
                    <th
                      key={h}
                      className={DENSE_TABLE_HEAD_CLS}
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
                      <p className="text-sm text-subtle">No APIC hosts yet</p>
                      <p className="text-xs text-faint mt-1">
                        Add the first shared controller endpoint to get started
                      </p>
                    </td>
                  </tr>
                ) : (
                  hosts.map((host, index) => (
                    <tr
                      key={host.id}
                      className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100 animate-fade-up"
                      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
                    >
                      <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                        <span className="font-medium text-foreground">{host.name}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-muted-foreground">{host.host}</span>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-subtle">
                        {new Date(host.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-2.5">
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
                            className="text-faint hover:text-destructive"
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
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              Add APIC Host
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Register a shared APIC controller endpoint. Users enter APIC credentials when they resync.
            </DialogDescription>
          </DialogHeader>
          <ApicHostForm form={createForm} onSubmit={handleCreate} formId="create-host-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
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
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              Edit APIC Host
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Update the shared controller endpoint details.
            </DialogDescription>
          </DialogHeader>
          <ApicHostForm form={editForm} onSubmit={handleUpdate} formId="edit-host-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
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
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingHost?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This will permanently remove the shared APIC host and its synced inventory history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel
              disabled={isPending}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
              className="bg-error text-error-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
