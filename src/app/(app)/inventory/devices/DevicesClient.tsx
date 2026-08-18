'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { IconPlus, IconPencil, IconTrash, IconSearch } from '@tabler/icons-react'
import { DeviceStatus } from '@prisma/client'

import {
  createDevice,
  updateDevice,
  deleteDevice,
  type SafeDeviceWithRack,
} from '@/actions/inventory/devices'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'
import { buildDeviceListUrl } from '@/lib/inventory/device-query'
import { DeviceForm } from '@/components/inventory/DeviceForm'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'

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
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import {
  DENSE_TABLE_HEAD_CLS,
  SEARCH_INPUT_CLS,
  TABLE_SCROLL_CLS,
} from '@/lib/ui-classes'

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PLANNED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  MAINTENANCE: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  RETIRED: 'bg-zinc-500/15 text-zinc-500',
}

export function DevicesClient({
  initialDevices,
  total,
  page,
  query,
  role,
}: {
  initialDevices: SafeDeviceWithRack[]
  total: number
  page: number
  query: string
  role: 'admin' | 'member'
}) {
  const router = useRouter()
  const [devices, setDevices] = useState<SafeDeviceWithRack[]>(initialDevices)
  const [searchValue, setSearchValue] = useState(query)
  const [isPending, setIsPending] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editingDevice, setEditingDevice] = useState<SafeDeviceWithRack | null>(null)
  const [deletingDevice, setDeletingDevice] = useState<SafeDeviceWithRack | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / 20))
  const isAdmin = role === 'admin'

  const emptyDefaults: DeviceFormValues = {
    name: '',
    serialNumber: '',
    assetTag: null,
    status: DeviceStatus.ACTIVE,
    vendor: '',
    model: '',
    heightU: 1,
  }

  const createForm = useForm<DeviceFormValues>({
    resolver: zodResolver(deviceSchema),
    defaultValues: emptyDefaults,
  })

  const editForm = useForm<DeviceUpdateFormValues>({
    resolver: zodResolver(deviceUpdateSchema),
    defaultValues: emptyDefaults,
  })

  function openEdit(device: SafeDeviceWithRack) {
    setEditingDevice(device)
    editForm.reset({
      name: device.name,
      serialNumber: device.serialNumber,
      assetTag: device.assetTag,
      status: device.status,
      vendor: device.vendor,
      model: device.model,
      heightU: device.heightU,
    })
    setEditOpen(true)
  }

  function openDelete(device: SafeDeviceWithRack) {
    setDeletingDevice(device)
    setDeleteOpen(true)
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    router.push(buildDeviceListUrl({ query: searchValue, page: 1 }))
  }

  function goToPage(nextPage: number) {
    router.push(buildDeviceListUrl({ query, page: nextPage }))
  }

  async function handleCreate(data: DeviceFormValues) {
    setIsPending(true)
    const result = await createDevice(data)
    setIsPending(false)
    if (result.success) {
      const withRack: SafeDeviceWithRack = { ...result.data, rack: null }
      setDevices((prev) => [withRack, ...prev])
      createForm.reset(emptyDefaults)
      setCreateOpen(false)
      toast.success('Device created')
    } else {
      toast.error(result.error)
    }
  }

  async function handleUpdate(data: DeviceUpdateFormValues) {
    if (!editingDevice) return
    setIsPending(true)
    const result = await updateDevice(editingDevice.id, data)
    setIsPending(false)
    if (result.success) {
      setDevices((prev) =>
        prev.map((d) => (d.id === editingDevice.id ? { ...d, ...result.data } : d)),
      )
      setEditOpen(false)
      setEditingDevice(null)
      toast.success('Device updated')
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    if (!deletingDevice) return
    setIsPending(true)
    const result = await deleteDevice(deletingDevice.id)
    setIsPending(false)
    if (result.success) {
      setDevices((prev) => prev.filter((d) => d.id !== deletingDevice.id))
      setDeleteOpen(false)
      setDeletingDevice(null)
      toast.success('Device deleted')
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="min-h-full bg-background">
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="px-8 h-16 flex items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-[18px] font-semibold text-foreground">Devices</h1>
            <p className="text-xs text-subtle mt-0.5">Physical device inventory</p>
          </div>
          <form onSubmit={submitSearch} className="relative flex-1 max-w-xs">
            <IconSearch size={13} stroke={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search name, serial, vendor..."
              className={SEARCH_INPUT_CLS}
            />
          </form>
          {isAdmin && (
            <button
              onClick={() => {
                createForm.reset(emptyDefaults)
                setCreateOpen(true)
              }}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-semibold px-3.5 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
            >
              <IconPlus size={11} stroke={1.75} />
              Add Device
            </button>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Name', 'Serial', 'Status', 'Vendor / Model', 'Rack', ...(isAdmin ? [''] : [])].map((h) => (
                    <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="px-4 py-14 text-center">
                      <p className="text-sm text-subtle">No devices found</p>
                    </td>
                  </tr>
                ) : (
                  devices.map((device) => (
                    <tr
                      key={device.id}
                      className="group border-b border-border-faint last:border-0 hover:bg-muted transition-colors duration-100"
                    >
                      <td className="px-4 py-2.5 border-l-2 border-l-transparent group-hover:border-l-primary transition-colors duration-100">
                        <Link href={`/inventory/devices/${device.id}`} className="font-medium text-foreground hover:underline">
                          {device.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-muted-foreground">{device.serialNumber}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLS[device.status] ?? ''}`}>
                          {device.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-subtle">{device.vendor} {device.model}</td>
                      <td className="px-4 py-2.5 text-subtle">
                        {device.rack ? `${device.rack.site.name} · ${device.rack.name}` : '—'}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(device)} title="Edit">
                              <IconPencil size={13} stroke={1.75} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openDelete(device)}
                              title="Delete"
                              className="text-faint hover:text-destructive"
                            >
                              <IconTrash size={13} stroke={1.75} />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-subtle">
            <span>Page {page} of {totalPages} ({total} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={(open) => { if (!open) createForm.reset(emptyDefaults); setCreateOpen(open) }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">Add Device</DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Register a new device. Rack placement is done from the Racks page.
            </DialogDescription>
          </DialogHeader>
          <DeviceForm form={createForm} onSubmit={handleCreate} formId="create-device-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <FooterCancel onClick={() => setCreateOpen(false)} disabled={isPending} />
            <FooterSubmit form="create-device-form" disabled={isPending} label={isPending ? 'Adding…' : 'Add Device'} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={(open) => { if (!open) setEditingDevice(null); setEditOpen(open) }}>
        <DialogContent className="bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">Edit Device</DialogTitle>
            <DialogDescription className="text-xs text-subtle">Update device identity and hardware details.</DialogDescription>
          </DialogHeader>
          <DeviceForm form={editForm} onSubmit={handleUpdate} formId="edit-device-form" />
          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <FooterCancel onClick={() => setEditOpen(false)} disabled={isPending} />
            <FooterSubmit form="edit-device-form" disabled={isPending} label={isPending ? 'Saving…' : 'Save Changes'} />
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!open) setDeletingDevice(null); setDeleteOpen(open) }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingDevice?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This will permanently remove the device from inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-1">
            <AlertDialogCancel disabled={isPending} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent">
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
