'use client'

import { useId, useState } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { toast } from 'sonner'
import { hasActiveDeviceFilters, type DeviceListFilters } from '@/lib/inventory/devices/params'
import type { DeviceExportRequest } from '@/lib/schemas/device-export'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FooterCancel, FooterSubmit } from '@/components/inventory/dialog-footer-buttons'

export function ExportDevicesDialog({
  allTotal,
  filteredTotal,
  filters,
  disabled = false,
}: {
  allTotal: number
  filteredTotal: number
  filters: DeviceListFilters
  disabled?: boolean
}) {
  const scopeId = useId()
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<DeviceExportRequest['scope']>('all')
  const [exporting, setExporting] = useState(false)

  function openDialog() {
    setScope(hasActiveDeviceFilters(filters) && filteredTotal > 0 ? 'filtered' : 'all')
    setOpen(true)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const payload: DeviceExportRequest = scope === 'all' ? { scope } : { scope, filters }
      const response = await fetch('/api/inventory/devices/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? 'Export failed')
      }

      const blob = await response.blob()
      const filename =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'inventory-devices.xlsx'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
      toast.success('Device export downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const choices = [
    {
      value: 'all' as const,
      title: 'All devices',
      description: `${allTotal.toLocaleString()} device${allTotal === 1 ? '' : 's'} in inventory`,
      disabled: false,
    },
    {
      value: 'filtered' as const,
      title: 'Current filters',
      description:
        filteredTotal === 0
          ? 'No devices match the current filters'
          : `${filteredTotal.toLocaleString()} matching device${filteredTotal === 1 ? '' : 's'} across all pages`,
      disabled: filteredTotal === 0,
    },
  ]

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 text-xs"
        disabled={disabled || allTotal === 0}
        onClick={openDialog}
      >
        <IconDownload size={12} stroke={1.75} />
        Export
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!exporting) setOpen(nextOpen)
        }}
      >
        <DialogContent
          className="border-border bg-card text-foreground sm:max-w-md"
          showCloseButton={!exporting}
          aria-busy={exporting}
        >
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              Export devices
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              Choose which devices to include in one Excel worksheet.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={exporting} className="space-y-2">
            <legend className="sr-only">Devices to export</legend>
            {choices.map((choice) => (
              <label
                key={choice.value}
                className={[
                  'flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors focus-within:ring-2 focus-within:ring-primary/20',
                  scope === choice.value
                    ? 'border-primary bg-primary/8'
                    : 'border-border bg-background',
                  choice.disabled || exporting
                    ? 'cursor-not-allowed opacity-50'
                    : 'cursor-pointer hover:bg-muted',
                ].join(' ')}
              >
                <input
                  type="radio"
                  name={scopeId}
                  value={choice.value}
                  checked={scope === choice.value}
                  disabled={choice.disabled}
                  onChange={() => setScope(choice.value)}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  <span className="block text-sm font-medium text-foreground">{choice.title}</span>
                  <span className="mt-0.5 block text-xs text-subtle">{choice.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <DialogFooter className="flex flex-row items-center justify-end gap-1 border-subtle bg-muted px-4 py-3">
            <FooterCancel onClick={() => setOpen(false)} disabled={exporting} />
            <FooterSubmit
              onClick={handleExport}
              disabled={exporting || (scope === 'filtered' && filteredTotal === 0)}
              label={exporting ? 'Exporting…' : 'Export'}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
