'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { IconDots, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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

import { createSite, deleteSite, updateSite, type SafeSite } from '@/actions/inventory/sites'
import { createRack, deleteRack, updateRack, type SafeRackWithDevices } from '@/actions/inventory/racks'
import {
  clearDevicePlacement,
  updateDeviceHeight,
  updateDevicePlacement,
  type DeviceCatalogEntry,
} from '@/actions/inventory/devices'
import { siteSchema, type SiteFormValues } from '@/lib/schemas/site'
import { rackSchema, type RackFormValues } from '@/lib/schemas/rack'
import { SiteForm } from '@/components/inventory/SiteForm'
import { RackForm } from '@/components/inventory/RackForm'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'
import {
  RackVisualization,
  type DragPayload,
  type HoverTarget,
  type RackItem,
} from '@/components/inventory/RackVisualization'
import { canPlaceDevice, type PlaceableDevice } from '@/lib/inventory/rack-placement'

export function RacksClient({
  sites,
  selectedSiteId,
  racks,
  allDevices,
  role,
}: {
  sites: SafeSite[]
  selectedSiteId: string | null
  racks: SafeRackWithDevices[]
  allDevices: DeviceCatalogEntry[]
  role: 'admin' | 'member'
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isAdmin = role === 'admin'

  const [siteList, setSiteList] = React.useState<SafeSite[]>(sites)
  const [prevSites, setPrevSites] = React.useState(sites)
  if (sites !== prevSites) {
    setPrevSites(sites)
    setSiteList(sites)
  }

  const [rackList, setRackList] = React.useState<RackItem[]>(
    racks.map((rack) => ({ id: rack.id, name: rack.name, heightU: rack.heightU, devices: rack.devices })),
  )
  const [prevRacks, setPrevRacks] = React.useState(racks)
  if (racks !== prevRacks) {
    setPrevRacks(racks)
    setRackList(racks.map((rack) => ({ id: rack.id, name: rack.name, heightU: rack.heightU, devices: rack.devices })))
  }

  const [deviceCatalog, setDeviceCatalog] = React.useState<DeviceCatalogEntry[]>(allDevices)
  const [prevAllDevices, setPrevAllDevices] = React.useState(allDevices)
  if (allDevices !== prevAllDevices) {
    setPrevAllDevices(allDevices)
    setDeviceCatalog(allDevices)
  }

  const [pendingDeviceIds, setPendingDeviceIds] = React.useState<Set<string>>(new Set())
  const [draggingPayload, setDraggingPayload] = React.useState<DragPayload | null>(null)
  const [hoverTarget, setHoverTarget] = React.useState<HoverTarget>(null)
  const [activeMenuDeviceId, setActiveMenuDeviceId] = React.useState<string | null>(null)

  const [siteDialogOpen, setSiteDialogOpen] = React.useState(false)
  const [editingSite, setEditingSite] = React.useState<SafeSite | null>(null)
  const [deleteSiteOpen, setDeleteSiteOpen] = React.useState(false)
  const [isSitePending, setIsSitePending] = React.useState(false)

  const [rackDialogOpen, setRackDialogOpen] = React.useState(false)
  const [editingRack, setEditingRack] = React.useState<RackItem | null>(null)
  const [deletingRack, setDeletingRack] = React.useState<RackItem | null>(null)
  const [deleteRackOpen, setDeleteRackOpen] = React.useState(false)
  const [isRackPending, setIsRackPending] = React.useState(false)

  const buildSiteHref = React.useCallback(
    (nextSiteId: string | null) => {
      const nextParams = new URLSearchParams(searchParams.toString())
      if (nextSiteId === null) nextParams.delete('siteId')
      else nextParams.set('siteId', nextSiteId)
      const query = nextParams.toString()
      return query ? `${pathname}?${query}` : pathname
    },
    [pathname, searchParams],
  )

  const siteForm = useForm<SiteFormValues>({
    resolver: zodResolver(siteSchema),
    defaultValues: { name: '', address: '', latitude: null, longitude: null },
  })

  const rackForm = useForm<RackFormValues>({
    resolver: zodResolver(rackSchema),
    defaultValues: { name: '', heightU: 42, siteId: selectedSiteId ?? '' },
  })

  function openCreateSite() {
    setEditingSite(null)
    siteForm.reset({ name: '', address: '', latitude: null, longitude: null })
    setSiteDialogOpen(true)
  }

  function openEditSite() {
    const site = siteList.find((s) => s.id === selectedSiteId) ?? null
    if (!site) return
    setEditingSite(site)
    siteForm.reset({ name: site.name, address: site.address, latitude: site.latitude, longitude: site.longitude })
    setSiteDialogOpen(true)
  }

  async function handleSubmitSite(data: SiteFormValues) {
    setIsSitePending(true)
    const result = editingSite ? await updateSite(editingSite.id, data) : await createSite(data)
    setIsSitePending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (editingSite) {
      setSiteList((prev) => prev.map((s) => (s.id === result.data.id ? result.data : s)).sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Site updated')
    } else {
      setSiteList((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)))
      toast.success('Site created')
      router.push(buildSiteHref(result.data.id))
    }
    setSiteDialogOpen(false)
    router.refresh()
  }

  async function handleDeleteSite() {
    if (!selectedSiteId) return
    setIsSitePending(true)
    const result = await deleteSite(selectedSiteId)
    setIsSitePending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    const remaining = siteList.filter((s) => s.id !== selectedSiteId)
    setSiteList(remaining)
    setDeleteSiteOpen(false)
    toast.success('Site deleted')
    router.push(buildSiteHref(remaining[0]?.id ?? null))
    router.refresh()
  }

  function openCreateRack() {
    if (!selectedSiteId) return
    setEditingRack(null)
    rackForm.reset({ name: '', heightU: 42, siteId: selectedSiteId })
    setRackDialogOpen(true)
  }

  function openEditRack(rack: RackItem) {
    setEditingRack(rack)
    rackForm.reset({ name: rack.name, heightU: rack.heightU, siteId: selectedSiteId ?? '' })
    setRackDialogOpen(true)
  }

  async function handleSubmitRack(data: RackFormValues) {
    setIsRackPending(true)
    const result = editingRack ? await updateRack(editingRack.id, data) : await createRack(data)
    setIsRackPending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    if (editingRack) {
      setRackList((prev) =>
        prev.map((r) => (r.id === result.data.id ? { ...r, name: result.data.name, heightU: result.data.heightU } : r)),
      )
      toast.success('Rack updated')
    } else {
      setRackList((prev) => [...prev, { id: result.data.id, name: result.data.name, heightU: result.data.heightU, devices: [] }])
      toast.success('Rack created')
    }
    setRackDialogOpen(false)
    router.refresh()
  }

  async function handleDeleteRack() {
    if (!deletingRack) return
    setIsRackPending(true)
    const result = await deleteRack(deletingRack.id)
    setIsRackPending(false)
    if (!result.success) {
      toast.error(result.error)
      return
    }
    setRackList((prev) => prev.filter((r) => r.id !== deletingRack.id))
    setDeleteRackOpen(false)
    setDeletingRack(null)
    toast.success('Rack deleted')
    router.refresh()
  }

  function handleSelectSiteChange(nextValue: string) {
    if (!nextValue) return
    router.push(buildSiteHref(nextValue))
  }

  function moveDeviceLocally(payload: DragPayload, toRackId: string, rackPosition: number) {
    setRackList((prev) => {
      const next = prev.map((rack) => ({ ...rack, devices: [...rack.devices] }))
      let movedDevice = null as RackItem['devices'][number] | null

      for (const rack of next) {
        const index = rack.devices.findIndex((d) => d.id === payload.deviceId)
        if (index !== -1) {
          const [device] = rack.devices.splice(index, 1)
          movedDevice = device
          break
        }
      }

      if (!movedDevice) {
        const catalogDevice = deviceCatalog.find((d) => d.id === payload.deviceId)
        if (!catalogDevice) return prev
        movedDevice = {
          id: catalogDevice.id,
          name: catalogDevice.name,
          serialNumber: catalogDevice.serialNumber,
          rackPosition,
          vendor: catalogDevice.vendor,
          model: catalogDevice.model,
          heightU: Math.max(1, catalogDevice.heightU),
        }
      }

      const targetRack = next.find((r) => r.id === toRackId)
      if (!targetRack) return prev

      targetRack.devices.push({ ...movedDevice, rackPosition })
      targetRack.devices.sort((a, b) => (a.rackPosition ?? 0) - (b.rackPosition ?? 0))
      return next
    })
  }

  async function handleDropDevice(rackId: string, targetTopUnit: number, payload: DragPayload) {
    const targetRack = rackList.find((r) => r.id === rackId)
    if (!targetRack) return

    const rackPosition = targetTopUnit - payload.heightU + 1
    if (rackPosition < 1) return

    const siblings: PlaceableDevice[] = targetRack.devices.map((d) => ({
      id: d.id,
      rackPosition: d.rackPosition,
      heightU: d.heightU,
    }))
    if (!canPlaceDevice(siblings, payload.deviceId, rackPosition, payload.heightU, targetRack.heightU)) {
      toast.error('Cannot place device here due to rack collision.')
      return
    }

    const previous = rackList
    moveDeviceLocally(payload, rackId, rackPosition)
    setDraggingPayload(null)
    setHoverTarget(null)
    setPendingDeviceIds((prev) => new Set(prev).add(payload.deviceId))

    const result = await updateDevicePlacement(payload.deviceId, rackId, rackPosition)

    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(payload.deviceId)
      return next
    })

    if (!result.success) {
      setRackList(previous)
      toast.error(result.error)
      return
    }

    setDeviceCatalog((prev) =>
      prev.map((d) => (d.id === payload.deviceId ? { ...d, rackId, rackPosition, rack: { name: targetRack.name } } : d)),
    )
    toast.success('Device position updated')
  }

  async function handleUnassignDevice(deviceId: string) {
    setPendingDeviceIds((prev) => new Set(prev).add(deviceId))
    const result = await clearDevicePlacement(deviceId)
    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setRackList((prev) => prev.map((rack) => ({ ...rack, devices: rack.devices.filter((d) => d.id !== deviceId) })))
    setDeviceCatalog((prev) => prev.map((d) => (d.id === deviceId ? { ...d, rackId: null, rackPosition: null, rack: null } : d)))
    toast.success('Device removed from rack')
  }

  async function handleResizeDeviceU(deviceId: string, delta: number) {
    const located = rackList
      .flatMap((rack) => rack.devices.map((device) => ({ rack, device })))
      .find((entry) => entry.device.id === deviceId)

    if (!located) {
      toast.error('Device not found')
      return
    }

    const nextHeight = located.device.heightU + delta
    if (nextHeight < 1) return

    if (
      located.device.rackPosition !== null &&
      !canPlaceDevice(
        located.rack.devices.map((d) => ({ id: d.id, rackPosition: d.rackPosition, heightU: d.heightU })),
        deviceId,
        located.device.rackPosition,
        nextHeight,
        located.rack.heightU,
      )
    ) {
      toast.error('Cannot resize: not enough free U space.')
      return
    }

    setPendingDeviceIds((prev) => new Set(prev).add(deviceId))
    const result = await updateDeviceHeight(deviceId, nextHeight)
    setPendingDeviceIds((prev) => {
      const next = new Set(prev)
      next.delete(deviceId)
      return next
    })

    if (!result.success) {
      toast.error(result.error)
      return
    }

    setRackList((prev) =>
      prev.map((rack) => ({
        ...rack,
        devices: rack.devices.map((d) => (d.id === deviceId ? { ...d, heightU: nextHeight } : d)),
      })),
    )
    setDeviceCatalog((prev) => prev.map((d) => (d.id === deviceId ? { ...d, heightU: nextHeight } : d)))
    toast.success(`Device resized to ${nextHeight}U`)
  }

  const selectedSite = siteList.find((s) => s.id === selectedSiteId) ?? null

  if (siteList.length === 0) {
    return (
      <div className="px-8 py-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
          <p className="text-muted-foreground text-sm">Create a site to start visualizing racks.</p>
        </div>
        {isAdmin && (
          <div className="rounded-lg border border-border p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-muted-foreground text-sm">No sites found.</p>
              <Button size="sm" onClick={openCreateSite}>
                <IconPlus size={14} stroke={1.75} />
                Create Site
              </Button>
            </div>
          </div>
        )}
        <SiteDrawer
          open={siteDialogOpen}
          onOpenChange={setSiteDialogOpen}
          editing={editingSite}
          form={siteForm}
          onSubmit={handleSubmitSite}
          isPending={isSitePending}
        />
      </div>
    )
  }

  return (
    <div className="px-8 py-6 space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Racks</h1>
        <p className="text-muted-foreground text-sm">Select a site to view its rack elevation.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-72">
          <label htmlFor="rack-site-select" className="text-xs font-medium text-foreground">Site</label>
          <NativeSelect
            id="rack-site-select"
            value={selectedSiteId ?? ''}
            onChange={(e) => handleSelectSiteChange(e.target.value)}
            className="w-full"
          >
            {siteList.map((site) => (
              <NativeSelectOption key={site.id} value={site.id}>{site.name}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={openCreateSite}>
              <IconPlus size={14} stroke={1.75} />
              Create Site
            </Button>
            <Button size="sm" onClick={openCreateRack} disabled={!selectedSiteId}>
              <IconPlus size={14} stroke={1.75} />
              Create Rack
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" disabled={!selectedSiteId} aria-label="Site actions">
                  <IconDots size={16} stroke={1.75} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={openEditSite}>
                  <IconPencil size={13} stroke={1.75} />
                  Edit site
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(event) => {
                    event.preventDefault()
                    setDeleteSiteOpen(true)
                  }}
                >
                  <IconTrash size={13} stroke={1.75} />
                  Delete site
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <Card className="border-border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="font-serif text-base font-semibold text-foreground">{selectedSite?.name ?? 'Selected Site'}</CardTitle>
            <Badge variant="outline" className="text-xs font-mono font-normal text-muted-foreground border-border bg-muted/50">
              {rackList.length} rack{rackList.length === 1 ? '' : 's'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div><span className="text-muted-foreground">Address: </span>{selectedSite?.address || '—'}</div>
          <div>
            <span className="text-muted-foreground">Coordinates: </span>
            {selectedSite?.latitude != null && selectedSite?.longitude != null
              ? `${selectedSite.latitude}, ${selectedSite.longitude}`
              : '—'}
          </div>
        </CardContent>
      </Card>

      {rackList.length === 0 ? (
        <div className="text-muted-foreground rounded-lg border border-border p-6 text-sm">
          No racks for this site.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rackList.map((rack) => (
            <RackVisualization
              key={rack.id}
              rack={rack}
              onDropDevice={handleDropDevice}
              allDevices={deviceCatalog}
              onUnassignDevice={handleUnassignDevice}
              onResizeDeviceU={handleResizeDeviceU}
              onDragStartDevice={setDraggingPayload}
              onDragEndDevice={() => {
                setDraggingPayload(null)
                setHoverTarget(null)
              }}
              onHoverUnit={(rackId, topUnit) => {
                if (!draggingPayload) return
                setHoverTarget({ rackId, topUnit })
              }}
              activeMenuDeviceId={activeMenuDeviceId}
              onMenuDeviceChange={setActiveMenuDeviceId}
              hoverTarget={hoverTarget}
              draggingPayload={draggingPayload}
              pendingDeviceIds={pendingDeviceIds}
              isAdmin={isAdmin}
              headerActions={
                isAdmin ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Rack actions">
                        <IconDots size={14} stroke={1.75} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => openEditRack(rack)}>
                        <IconPencil size={13} stroke={1.75} />
                        Edit rack
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={(event) => {
                          event.preventDefault()
                          setDeletingRack(rack)
                          setDeleteRackOpen(true)
                        }}
                      >
                        <IconTrash size={13} stroke={1.75} />
                        Delete rack
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null
              }
            />
          ))}
        </div>
      )}

      <SiteDrawer
        open={siteDialogOpen}
        onOpenChange={setSiteDialogOpen}
        editing={editingSite}
        form={siteForm}
        onSubmit={handleSubmitSite}
        isPending={isSitePending}
      />

      <AlertDialog open={deleteSiteOpen} onOpenChange={setDeleteSiteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete site?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Sites with racks cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSitePending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteSite} disabled={isSitePending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={rackDialogOpen} onOpenChange={setRackDialogOpen}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 border-l border-border bg-card shadow-2xl data-[side=right]:sm:max-w-md">
          <SheetHeader className="px-6 py-5 border-b border-subtle shrink-0">
            <SheetTitle className="font-serif text-base font-semibold text-foreground">
              {editingRack ? 'Edit Rack' : 'Create Rack'}
            </SheetTitle>
            <SheetDescription className="text-xs text-subtle">
              {editingRack ? 'Update rack details.' : 'Add a new rack to the selected site.'}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <RackForm form={rackForm} onSubmit={handleSubmitRack} formId="rack-form" sites={siteList} />
          </div>
          <SheetFooter className="flex flex-row items-center justify-end border-t border-subtle bg-muted px-6 py-3.5 gap-2 shrink-0">
            <FooterCancel onClick={() => setRackDialogOpen(false)} disabled={isRackPending} />
            <FooterSubmit form="rack-form" disabled={isRackPending} label={isRackPending ? 'Saving…' : editingRack ? 'Save Changes' : 'Create Rack'} />
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteRackOpen} onOpenChange={setDeleteRackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{deletingRack?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Devices in this rack will be unassigned, not deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRackPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteRack} disabled={isRackPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SiteDrawer({
  open,
  onOpenChange,
  editing,
  form,
  onSubmit,
  isPending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: SafeSite | null
  form: ReturnType<typeof useForm<SiteFormValues>>
  onSubmit: (data: SiteFormValues) => void
  isPending: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 border-l border-border bg-card shadow-2xl data-[side=right]:sm:max-w-md">
        <SheetHeader className="px-6 py-5 border-b border-subtle shrink-0">
          <SheetTitle className="font-serif text-base font-semibold text-foreground">
            {editing ? 'Edit Site' : 'Create Site'}
          </SheetTitle>
          <SheetDescription className="text-xs text-subtle">
            {editing ? 'Update the site details.' : 'Add a new physical site.'}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <SiteForm form={form} onSubmit={onSubmit} formId="site-form" />
        </div>
        <SheetFooter className="flex flex-row items-center justify-end border-t border-subtle bg-muted px-6 py-3.5 gap-2 shrink-0">
          <FooterCancel onClick={() => onOpenChange(false)} disabled={isPending} />
          <FooterSubmit form="site-form" disabled={isPending} label={isPending ? 'Saving…' : editing ? 'Save Changes' : 'Create Site'} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
