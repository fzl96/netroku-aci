'use client'

import type { FormEvent } from 'react'
import { use, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  IconPlus,
  IconPencil,
  IconTrash,
  IconSearch,
  IconFileSpreadsheet,
  IconDeviceDesktopSearch,
} from '@tabler/icons-react'
import { DeviceStatus } from '@prisma/client'

import { createDevice, updateDevice, deleteDevice } from '@/lib/inventory/devices/actions'
import type {
  DevicesLoadState,
  DevicesResultsPayload,
  SafeDeviceStack,
  SafeDeviceWithRack,
} from '@/lib/inventory/devices/query'
import {
  deviceSchema,
  deviceUpdateSchema,
  type DeviceFormValues,
  type DeviceUpdateFormValues,
} from '@/lib/schemas/device'
import { buildDeviceListUrl, buildDeviceSearchUrl } from '@/lib/inventory/devices/params'
import { DeviceForm } from '@/components/inventory/device-form'
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import Link from 'next/link'
import { DENSE_TABLE_HEAD_CLS, SEARCH_INPUT_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'
import { DevicesRegionError } from './devices-region-error'

const STATUS_BADGE_CLS: Record<string, string> = {
  ACTIVE: 'bg-green-500/15 text-green-700 dark:text-green-400',
  PLANNED: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  MAINTENANCE: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  RETIRED: 'bg-muted text-muted-foreground',
}

function DevicesResultsContent({
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
      version: device.version ?? null,
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

  function submitSearch(e: FormEvent) {
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
        setStacks((prev) =>
          [...prev, result.data.deviceStack!].sort((a, b) => a.name.localeCompare(b.name)),
        )
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
      setDevices((prev) => prev.map((d) => (d.id === editingDevice.id ? result.data : d)))
      if (result.data.deviceStack && !stacks.some((s) => s.id === result.data.deviceStack?.id)) {
        setStacks((prev) =>
          [...prev, result.data.deviceStack!].sort((a, b) => a.name.localeCompare(b.name)),
        )
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
    <>
      <div className="space-y-4 px-8 py-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <form onSubmit={submitSearch} className="relative max-w-xs flex-1">
            <IconSearch
              size={13}
              stroke={1.75}
              className="absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
            />
            <input
              value={searchValue}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search name, serial, vendor..."
              className={SEARCH_INPUT_CLS}
            />
          </form>
          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                    <Link href="/inventory/discovered">
                      <IconDeviceDesktopSearch className="h-3.5 w-3.5" />
                      Import discovered
                    </Link>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Add devices discovered by ACI or Legacy, or link them to existing inventory. Your
                  asset tags and rack details are preserved.
                </TooltipContent>
              </Tooltip>
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
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
              >
                <IconPlus size={11} stroke={1.75} />
                Add Device
              </button>
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className={TABLE_SCROLL_CLS}>
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {[
                    'Name',
                    'Serial',
                    'Management IP',
                    'Status',
                    'Vendor / Model',
                    'Rack',
                    'Stack',
                    ...(isAdmin ? [''] : []),
                  ].map((h) => (
                    <th key={h} className={DENSE_TABLE_HEAD_CLS}>
                      {h}
                    </th>
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
                      className="group border-b border-border-faint transition-colors duration-100 last:border-0 hover:bg-muted"
                    >
                      <td className="border-l-2 border-l-transparent px-4 py-2.5 transition-colors duration-100 group-hover:border-l-primary">
                        <Link
                          href={`/inventory/devices/${device.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {device.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-mono text-muted-foreground">
                          {device.serialNumber}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {device.managementIp ? (
                          <span className="font-mono text-foreground">{device.managementIp}</span>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE_CLS[device.status] ?? ''}`}
                        >
                          {device.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-subtle">
                        {device.vendor} {device.model}
                      </td>
                      <td className="px-4 py-2.5 text-subtle">
                        {device.rack ? `${device.rack.site.name} · ${device.rack.name}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-subtle">
                        {device.deviceStack ? (
                          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                            <span>{device.deviceStack.name}</span>
                            <span className="text-[10px] text-muted-foreground">
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
                          <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => openEdit(device)}
                              title="Edit"
                            >
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
            <span>
              Page {page} of {totalPages} ({total} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isNavigationPending}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isNavigationPending}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      <Sheet
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) createForm.reset(emptyDefaults)
          setCreateOpen(open)
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">
              Add Device
            </SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              Register a new device. Rack placement is done from the Racks page.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DeviceForm
              form={createForm}
              onSubmit={handleCreate}
              formId="create-device-form"
              existingStacks={effectiveStacks}
            />
          </div>
          <SheetFooter className="flex shrink-0 flex-row items-center justify-end gap-2 border-t border-subtle bg-muted px-6 py-3.5">
            <FooterCancel onClick={() => setCreateOpen(false)} disabled={isMutating} />
            <FooterSubmit
              form="create-device-form"
              disabled={isMutating}
              label={isMutating ? 'Adding…' : 'Add Device'}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) setEditingDevice(null)
          setEditOpen(open)
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-l border-border bg-card p-0 shadow-2xl data-[side=right]:sm:max-w-md"
        >
          <SheetHeader className="shrink-0 border-b border-subtle px-6 py-5">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">
              Edit Device
            </SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              Update device identity and hardware details.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <DeviceForm
              form={editForm}
              sourceOwned={Boolean(editingDevice?.source)}
              onSubmit={handleUpdate}
              formId="edit-device-form"
              existingStacks={effectiveStacks}
            />
          </div>
          <SheetFooter className="flex shrink-0 flex-row items-center justify-end gap-2 border-t border-subtle bg-muted px-6 py-3.5">
            <FooterCancel onClick={() => setEditOpen(false)} disabled={isMutating} />
            <FooterSubmit
              form="edit-device-form"
              disabled={isMutating}
              label={isMutating ? 'Saving…' : 'Save Changes'}
            />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) setDeletingDevice(null)
          setDeleteOpen(open)
        }}
      >
        <AlertDialogContent className="border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-base font-semibold text-foreground">
              Delete &ldquo;{deletingDevice?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-subtle">
              This will permanently remove the device from inventory. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-end gap-1 rounded-b-xl border-t border-subtle bg-muted px-4 py-3">
            <AlertDialogCancel
              disabled={isMutating}
              className="border-0 bg-transparent px-4 py-2 text-sm text-muted-foreground shadow-none transition-colors hover:bg-transparent hover:text-foreground"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={isMutating}
              className="rounded-lg bg-error px-5 py-2 text-sm font-semibold text-error-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {isMutating ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function DevicesResults({
  dataPromise,
}: {
  dataPromise: Promise<DevicesLoadState<DevicesResultsPayload>>
}) {
  const state = use(dataPromise)
  if (state.kind === 'unauthorized') return <DevicesRegionError />

  const { params, role, page, stacks } = state.data
  return (
    <DevicesResultsContent
      initialDevices={page.devices}
      existingStacks={stacks}
      total={page.total}
      page={page.page}
      query={params.query}
      role={role}
    />
  )
}
