'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { IconPlus, IconPencil, IconTrash, IconSearch, IconFileSpreadsheet } from '@tabler/icons-react'
import { DeviceStatus } from '@prisma/client'

import {
  createDevice,
  updateDevice,
  deleteDevice,
  type SafeDeviceWithRack,
  type SafeDeviceStack,
} from '@/actions/inventory/devices'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'
import { buildDeviceListUrl, buildDeviceSearchUrl } from '@/lib/inventory/device-query'
import { DeviceForm } from '@/components/inventory/DeviceForm'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
  RETIRED: 'bg-muted text-muted-foreground',
}

export function DevicesClient({
  initialDevices,
  existingStacks = [],
  total,
  page,
  query,
  role,
}: {
  initialDevices: SafeDeviceWithRack[]
  existingStacks?: SafeDeviceStack[]
  total: number
  page: number
  query: string
  role: 'admin' | 'member'
}) {
  const router = useRouter()
  const [devices, setDevices] = useState<SafeDeviceWithRack[]>(initialDevices)
  const [stacks, setStacks] = useState(existingStacks)
  const [searchValue, setSearchValue] = useState(query)
  const [isMutating, setIsMutating] = useState(false)
  const [isNavigationPending, startNavigation] = useTransition()
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [lastDispatchedQuery, setLastDispatchedQuery] = useState(query)
  const [previousQuery, setPreviousQuery] = useState(query)
  const [previousInitialDevices, setPreviousInitialDevices] = useState(initialDevices)
  const [previousExistingStacks, setPreviousExistingStacks] = useState(existingStacks)

  if (initialDevices !== previousInitialDevices) {
    setPreviousInitialDevices(initialDevices)
    setDevices(initialDevices)
  }
  if (existingStacks !== previousExistingStacks) {
    setPreviousExistingStacks(existingStacks)
    setStacks(existingStacks)
  }
  if (query !== previousQuery) {
    setPreviousQuery(query)
    if (query !== lastDispatchedQuery) setSearchValue(query)
  }

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [editingDevice, setEditingDevice] = useState<SafeDeviceWithRack | null>(null)
  const [deletingDevice, setDeletingDevice] = useState<SafeDeviceWithRack | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / 20))
  const isAdmin = role === 'admin'

  const effectiveStacks: SafeDeviceStack[] = useMemo(() => {
    const map = new Map<string, SafeDeviceStack>()
    for (const s of stacks) {
      map.set(s.name, { ...s, members: s.members ? [...s.members] : [] })
    }

    for (const d of devices) {
      if (d.deviceStack) {
        const stackName = d.deviceStack.name
        const existing = map.get(stackName) ?? {
          id: d.deviceStack.id,
          name: stackName,
          members: [],
        }
        const memberList = existing.members ? [...existing.members] : []
        const idx = memberList.findIndex((m) => m.id === d.id)
        const memberObj = {
          id: d.id,
          name: d.name,
          stackMember: d.stackMember,
          stackRole: d.stackRole,
        }
        if (idx >= 0) {
          memberList[idx] = memberObj
        } else {
          memberList.push(memberObj)
        }
        existing.members = memberList
        existing.memberCount = memberList.length
        map.set(stackName, existing)
      } else {
        for (const s of map.values()) {
          if (s.members?.some((m) => m.id === d.id)) {
            s.members = s.members.filter((m) => m.id !== d.id)
            s.memberCount = s.members.length
          }
        }
      }
    }

    const result: SafeDeviceStack[] = []
    for (const s of map.values()) {
      if ((s.members?.length ?? 0) > 0) {
        s.memberCount = s.members!.length
        result.push(s)
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [stacks, devices])

  const emptyDefaults: DeviceFormValues = {
    name: '',
    serialNumber: '',
    assetTag: null,
    managementIp: null,
    status: DeviceStatus.ACTIVE,
    vendor: '',
    model: '',
    heightU: 1,
    deviceStackName: null,
    stackRole: null,
    stackMember: null,
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
      managementIp: device.managementIp,
      status: device.status,
      vendor: device.vendor,
      model: device.model,
      heightU: device.heightU,
      deviceStackName: device.deviceStack?.name ?? null,
      stackRole: device.stackRole,
      stackMember: device.stackMember,
    })
    setEditOpen(true)
  }

  function openDelete(device: SafeDeviceWithRack) {
    setDeletingDevice(device)
    setDeleteOpen(true)
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault()
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    setLastDispatchedQuery(searchValue.trim())
    startNavigation(() => {
      router.replace(buildDeviceSearchUrl(searchValue))
    })
  }

  function handleSearchChange(value: string) {
    setSearchValue(value)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setLastDispatchedQuery(value.trim())
      startNavigation(() => {
        router.replace(buildDeviceSearchUrl(value))
      })
    }, 300)
  }

  function goToPage(nextPage: number) {
    startNavigation(() => {
      router.replace(buildDeviceListUrl({ query, page: nextPage }))
    })
  }

  async function handleCreate(data: DeviceFormValues) {
    setIsMutating(true)
    const result = await createDevice(data)
    setIsMutating(false)
    if (result.success) {
      setDevices((prev) => [result.data, ...prev])
      if (result.data.deviceStack && !stacks.some((s) => s.id === result.data.deviceStack?.id)) {
        setStacks((prev) => [...prev, result.data.deviceStack!].sort((a, b) => a.name.localeCompare(b.name)))
      }
      createForm.reset(emptyDefaults)
      setCreateOpen(false)
      toast.success('Device created')
    } else {
      toast.error(result.error)
    }
  }

  async function handleUpdate(data: DeviceUpdateFormValues) {
    if (!editingDevice) return
    setIsMutating(true)
    const result = await updateDevice(editingDevice.id, data)
    setIsMutating(false)
    if (result.success) {
      setDevices((prev) =>
        prev.map((d) => (d.id === editingDevice.id ? result.data : d)),
      )
      if (result.data.deviceStack && !stacks.some((s) => s.id === result.data.deviceStack?.id)) {
        setStacks((prev) => [...prev, result.data.deviceStack!].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setEditOpen(false)
      setEditingDevice(null)
      toast.success('Device updated')
    } else {
      toast.error(result.error)
    }
  }

  async function handleDelete() {
    if (!deletingDevice) return
    setIsMutating(true)
    const result = await deleteDevice(deletingDevice.id)
    setIsMutating(false)
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
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search name, serial, vendor..."
              className={SEARCH_INPUT_CLS}
            />
          </form>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                <Link href="/inventory/devices/import">
                  <IconFileSpreadsheet className="h-3.5 w-3.5" />
                  Import CSV
                </Link>
              </Button>
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
            </div>
          )}
        </div>
      </div>

      <div className="px-8 py-6 space-y-4">
        <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {['Name', 'Serial', 'Management IP', 'Status', 'Vendor / Model', 'Rack', 'Stack', ...(isAdmin ? [''] : [])].map((h) => (
                    <th key={h} className={DENSE_TABLE_HEAD_CLS}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 8 : 7} className="px-4 py-14 text-center">
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
                        {device.managementIp ? (
                          <span className="font-mono text-foreground">{device.managementIp}</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
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
                      <td className="px-4 py-2.5 text-subtle">
                        {device.deviceStack ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                            <span>{device.deviceStack.name}</span>
                            <span className="text-muted-foreground text-[10px]">
                              · {device.stackRole === 'MASTER' ? 'Master' : 'Member'}
                              {device.stackMember != null ? ` (SW #${device.stackMember})` : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
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
              <Button variant="outline" size="sm" disabled={page <= 1 || isNavigationPending} onClick={() => goToPage(page - 1)}>
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages || isNavigationPending} onClick={() => goToPage(page + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={createOpen} onOpenChange={(open) => { if (!open) createForm.reset(emptyDefaults); setCreateOpen(open) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 border-l border-border bg-card shadow-2xl data-[side=right]:sm:max-w-md">
          <SheetHeader className="px-6 py-5 border-b border-subtle shrink-0">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">Add Device</SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              Register a new device. Rack placement is done from the Racks page.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DeviceForm form={createForm} onSubmit={handleCreate} formId="create-device-form" existingStacks={effectiveStacks} />
          </div>
          <SheetFooter className="flex flex-row items-center justify-end border-t border-subtle bg-muted px-6 py-3.5 gap-2 shrink-0">
            <FooterCancel onClick={() => setCreateOpen(false)} disabled={isMutating} />
            <FooterSubmit form="create-device-form" disabled={isMutating} label={isMutating ? 'Adding…' : 'Add Device'} />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={editOpen} onOpenChange={(open) => { if (!open) setEditingDevice(null); setEditOpen(open) }}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 border-l border-border bg-card shadow-2xl data-[side=right]:sm:max-w-md">
          <SheetHeader className="px-6 py-5 border-b border-subtle shrink-0">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">Edit Device</SheetTitle>
            <SheetDescription className="text-xs text-subtle">Update device identity and hardware details.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DeviceForm form={editForm} onSubmit={handleUpdate} formId="edit-device-form" existingStacks={effectiveStacks} />
          </div>
          <SheetFooter className="flex flex-row items-center justify-end border-t border-subtle bg-muted px-6 py-3.5 gap-2 shrink-0">
            <FooterCancel onClick={() => setEditOpen(false)} disabled={isMutating} />
            <FooterSubmit form="edit-device-form" disabled={isMutating} label={isMutating ? 'Saving…' : 'Save Changes'} />
          </SheetFooter>
        </SheetContent>
      </Sheet>

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
            <AlertDialogCancel disabled={isMutating} className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border-0 bg-transparent shadow-none hover:bg-transparent">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isMutating}
              className="bg-error text-error-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {isMutating ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
