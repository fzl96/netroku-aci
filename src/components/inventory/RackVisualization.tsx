// src/components/inventory/RackVisualization.tsx
'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { IconGripVertical, IconTrash } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { canPlaceDevice, type PlaceableDevice } from '@/lib/inventory/rack-placement'
import type { DeviceCatalogEntry } from '@/actions/inventory/devices'

export type RackDevice = {
  id: string
  name: string
  serialNumber: string
  rackPosition: number | null
  vendor: string
  model: string
  heightU: number
}

export type RackItem = {
  id: string
  name: string
  heightU: number
  devices: RackDevice[]
}

export type DragPayload = {
  deviceId: string
  heightU: number
}

export type HoverTarget = {
  rackId: string
  topUnit: number
} | null

function toRackPlacement(rackHeight: number, device: RackDevice) {
  if (!device.rackPosition) return null

  const height = Math.max(1, device.heightU)
  const topUnit = device.rackPosition + height - 1
  if (topUnit > rackHeight) return null

  const rowStart = rackHeight - topUnit + 1
  return { rowStart, rowSpan: height }
}

export function RackVisualization({
  rack,
  onDropDevice,
  allDevices,
  onUnassignDevice,
  onResizeDeviceU,
  onDragStartDevice,
  onDragEndDevice,
  onHoverUnit,
  activeMenuDeviceId,
  onMenuDeviceChange,
  hoverTarget,
  draggingPayload,
  pendingDeviceIds,
  isAdmin,
}: {
  rack: RackItem
  onDropDevice: (rackId: string, targetTopUnit: number, payload: DragPayload) => void
  allDevices: DeviceCatalogEntry[]
  onUnassignDevice: (deviceId: string) => void
  onResizeDeviceU: (deviceId: string, delta: number) => void
  onDragStartDevice: (payload: DragPayload) => void
  onDragEndDevice: () => void
  onHoverUnit: (rackId: string, topUnit: number) => void
  activeMenuDeviceId: string | null
  onMenuDeviceChange: (deviceId: string | null) => void
  hoverTarget: HoverTarget
  draggingPayload: DragPayload | null
  pendingDeviceIds: Set<string>
  isAdmin: boolean
}) {
  const [rowSearchByKey, setRowSearchByKey] = React.useState<Record<string, string>>({})
  const units = Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i)

  const placedDevices = rack.devices
    .map((device) => {
      const placement = toRackPlacement(rack.heightU, device)
      if (!placement) return null
      return { ...device, ...placement }
    })
    .filter((d): d is NonNullable<typeof d> => Boolean(d))

  const occupiedUnits = React.useMemo(() => {
    const result = new Set<number>()
    for (const device of rack.devices) {
      if (!device.rackPosition) continue
      const height = Math.max(1, device.heightU)
      for (let i = device.rackPosition; i < device.rackPosition + height; i += 1) {
        result.add(i)
      }
    }
    return result
  }, [rack.devices])

  const placeableSiblings: PlaceableDevice[] = rack.devices.map((d) => ({
    id: d.id,
    rackPosition: d.rackPosition,
    heightU: d.heightU,
  }))

  const highlightedRange = React.useMemo(() => {
    if (!draggingPayload || !hoverTarget || hoverTarget.rackId !== rack.id) return null

    const start = hoverTarget.topUnit - draggingPayload.heightU + 1
    const end = hoverTarget.topUnit
    if (start < 1 || end > rack.heightU) return { start, end, valid: false }

    const valid = canPlaceDevice(
      placeableSiblings,
      draggingPayload.deviceId,
      start,
      draggingPayload.heightU,
      rack.heightU,
    )
    return { start, end, valid }
  }, [draggingPayload, hoverTarget, rack.id, rack.heightU, placeableSiblings])

  function handleDropEvent(event: React.DragEvent<HTMLDivElement>, unit: number) {
    event.preventDefault()
    event.stopPropagation()
    const raw = event.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as DragPayload
      onDropDevice(rack.id, unit, payload)
    } catch {
      // Ignore invalid drag payloads.
    }
  }

  return (
    <Card className="border-zinc-300 bg-zinc-50/70 dark:border-[#2a2a2a] dark:bg-[#181818]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{rack.name}</CardTitle>
          <Badge variant="outline" className="dark:border-[#3a3a3a] dark:bg-[#212121] dark:text-[#d4d4d4]">
            {rack.heightU}U
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative overflow-hidden rounded-md border border-zinc-300 dark:border-[#2f2f2f]">
          <div
            className="grid grid-cols-[52px_1fr] bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[#181818] dark:to-[#212121]"
            style={{ gridTemplateRows: `repeat(${rack.heightU}, minmax(32px, 1fr))` }}
          >
            {units.map((unit) => {
              const inHighlight =
                highlightedRange && unit >= highlightedRange.start && unit <= highlightedRange.end
              const cellClass = [
                'border-l border-b border-dashed border-zinc-300 transition-colors dark:border-[#2f2f2f]',
                inHighlight
                  ? highlightedRange.valid
                    ? 'bg-zinc-300/70 dark:bg-[#353535]'
                    : 'bg-zinc-400/70 dark:bg-[#4a2f2f]'
                  : 'hover:bg-zinc-200/50 dark:hover:bg-[#262626]',
              ].join(' ')

              return (
                <React.Fragment key={unit}>
                  <div className="border-b border-zinc-300 px-2 py-1 text-right text-[11px] font-medium text-zinc-600 dark:border-[#2f2f2f] dark:text-[#a3a3a3]">
                    U{String(unit).padStart(2, '0')}
                  </div>
                  {occupiedUnits.has(unit) || !isAdmin ? (
                    <div
                      data-rack-u="true"
                      className={cellClass}
                      {...(isAdmin
                        ? {
                            onDragEnter: () => onHoverUnit(rack.id, unit),
                            onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
                              event.preventDefault()
                              onHoverUnit(rack.id, unit)
                            },
                            onDrop: (event: React.DragEvent<HTMLDivElement>) => handleDropEvent(event, unit),
                          }
                        : {})}
                    />
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div
                          data-rack-u="true"
                          className={cellClass}
                          onDragEnter={() => onHoverUnit(rack.id, unit)}
                          onDragOver={(event) => {
                            event.preventDefault()
                            onHoverUnit(rack.id, unit)
                          }}
                          onDrop={(event) => handleDropEvent(event, unit)}
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="max-h-72 w-72 overflow-y-auto">
                        {(() => {
                          const searchKey = `${rack.id}-${unit}`
                          const query = (rowSearchByKey[searchKey] ?? '').trim().toLowerCase()
                          const filteredDevices = allDevices.filter((device) => {
                            if (!query) return true
                            const target = `${device.name} ${device.serialNumber}`.toLowerCase()
                            return target.includes(query)
                          })

                          return (
                            <>
                              <DropdownMenuLabel>Add device to U{unit}</DropdownMenuLabel>
                              <div className="px-2 pb-2" onPointerDown={(event) => event.stopPropagation()}>
                                <Input
                                  value={rowSearchByKey[searchKey] ?? ''}
                                  onChange={(event) =>
                                    setRowSearchByKey((prev) => ({ ...prev, [searchKey]: event.target.value }))
                                  }
                                  onKeyDown={(event) => event.stopPropagation()}
                                  placeholder="Search device or serial..."
                                  className="h-8"
                                />
                              </div>
                              <DropdownMenuSeparator />
                              {filteredDevices.length > 0 ? (
                                filteredDevices.map((device) => (
                                  <DropdownMenuItem
                                    key={`${rack.id}-${unit}-${device.id}`}
                                    onSelect={(event) => {
                                      event.preventDefault()
                                      onDropDevice(rack.id, unit, {
                                        deviceId: device.id,
                                        heightU: Math.max(1, device.heightU),
                                      })
                                    }}
                                  >
                                    <div className="flex w-full items-center justify-between gap-2">
                                      <span className="truncate">{device.name} · {device.serialNumber}</span>
                                      <span className="text-muted-foreground shrink-0 text-[10px]">
                                        {device.rackId !== null && device.rackPosition !== null
                                          ? `Rack ${device.rackId} · U${device.rackPosition}`
                                          : ''}
                                      </span>
                                    </div>
                                  </DropdownMenuItem>
                                ))
                              ) : (
                                <DropdownMenuItem disabled>No device found</DropdownMenuItem>
                              )}
                            </>
                          )
                        })()}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </React.Fragment>
              )
            })}
          </div>

          <div
            className="pointer-events-none absolute inset-y-0 right-0 left-[52px] grid px-1 py-0"
            style={{ gridTemplateRows: `repeat(${rack.heightU}, minmax(32px, 1fr))` }}
          >
            {placedDevices.map((device) => {
              const cardBody = (
                <div
                  data-device-card="true"
                  className={[
                    'pointer-events-auto relative z-10 mx-1 my-0 flex h-full min-h-0 cursor-pointer flex-col justify-center overflow-hidden rounded border border-zinc-500 bg-zinc-300 py-1 pr-2 pl-7 text-xs text-zinc-900 shadow-sm transition-all dark:border-[#474747] dark:bg-[#2b2b2b] dark:text-[#e5e5e5]',
                    draggingPayload?.deviceId === device.id
                      ? '-translate-y-0.5 scale-[1.06] bg-zinc-200 shadow-2xl ring-2 ring-zinc-500/70 dark:bg-[#3a3a3a] dark:ring-zinc-300/40'
                      : '',
                  ].join(' ')}
                  style={{
                    gridRow: `${device.rowStart} / span ${device.rowSpan}`,
                    opacity:
                      pendingDeviceIds.has(device.id) || draggingPayload?.deviceId === device.id ? 0.55 : 1,
                  }}
                  title={`${device.name} (${device.serialNumber})`}
                >
                  {isAdmin && (
                    <div
                      draggable={!pendingDeviceIds.has(device.id)}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => event.stopPropagation()}
                      onDragStart={(event) => {
                        const payload: DragPayload = {
                          deviceId: device.id,
                          heightU: Math.max(1, device.heightU),
                        }
                        const dragCard = event.currentTarget.closest("[data-device-card='true']") as HTMLElement | null
                        if (dragCard) {
                          event.dataTransfer.setDragImage(dragCard, dragCard.clientWidth / 2, dragCard.clientHeight / 2)
                        }
                        onDragStartDevice(payload)
                        onMenuDeviceChange(null)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/json', JSON.stringify(payload))
                      }}
                      onDragEnd={onDragEndDevice}
                      className="absolute top-1/2 left-1 flex size-4 -translate-y-1/2 cursor-grab items-center justify-center rounded-sm text-zinc-600 opacity-70 hover:bg-zinc-400/30 hover:opacity-100 active:cursor-grabbing dark:text-zinc-300 dark:hover:bg-zinc-600/30"
                      title="Drag device"
                    >
                      <IconGripVertical size={12} stroke={1.75} />
                    </div>
                  )}
                  {device.rowSpan === 1 ? (
                    <div className="truncate text-[11px] leading-none font-semibold">
                      {device.name} · {device.serialNumber}
                    </div>
                  ) : (
                    <>
                      <div className="truncate font-semibold leading-tight">{device.name}</div>
                      <div className="truncate text-[10px] leading-tight opacity-80">{device.serialNumber}</div>
                    </>
                  )}
                </div>
              )

              if (!isAdmin) {
                return <React.Fragment key={device.id}>{cardBody}</React.Fragment>
              }

              return (
                <DropdownMenu
                  key={device.id}
                  open={activeMenuDeviceId === device.id}
                  onOpenChange={(open) => onMenuDeviceChange(open ? device.id : null)}
                >
                  <DropdownMenuTrigger asChild>{cardBody}</DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onResizeDeviceU(device.id, 1)
                      }}
                    >
                      Expand U (+1)
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={device.heightU <= 1}
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onResizeDeviceU(device.id, -1)
                      }}
                    >
                      Shrink U (-1)
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={(event) => {
                        event.preventDefault()
                        onMenuDeviceChange(null)
                        onUnassignDevice(device.id)
                      }}
                    >
                      <IconTrash size={13} stroke={1.75} />
                      Remove from rack
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
