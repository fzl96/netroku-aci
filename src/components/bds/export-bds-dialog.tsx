'use client'

import { useState } from 'react'
import { IconDownload } from '@tabler/icons-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { hasBdFilters, type BdFilters } from '@/lib/bds/params'

export function ExportBdsDialog({
  apicHostId,
  hostTotal,
  filteredTotal,
  filters,
}: {
  apicHostId: string
  hostTotal: number
  filteredTotal: number
  filters: BdFilters
}) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<'all' | 'filtered'>('all')
  const [exporting, setExporting] = useState(false)
  async function download() {
    setExporting(true)
    try {
      const response = await fetch('/api/bds/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apicHostId, scope, ...(scope === 'filtered' ? { filters } : {}) }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.error ?? 'Export failed')
      }
      const url = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = url
      link.download =
        response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] ??
        'bridge-domains.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
      toast.success('Bridge Domain export downloaded')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }
  return (
    <>
      <button
        type="button"
        disabled={!apicHostId || !hostTotal}
        onClick={() => {
          setScope(hasBdFilters(filters) && filteredTotal > 0 ? 'filtered' : 'all')
          setOpen(true)
        }}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
      >
        <IconDownload size={12} />
        Export
      </button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!exporting) setOpen(value)
        }}
      >
        <DialogContent className="border-border bg-card text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Bridge Domains</DialogTitle>
            <DialogDescription>
              Download configuration, subnets, and connected EPGs as an Excel workbook.
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={exporting} className="space-y-2">
            <legend className="sr-only">Export scope</legend>
            {(['all', 'filtered'] as const).map((value) => (
              <label
                key={value}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-sm"
              >
                <input
                  type="radio"
                  name="bd-export-scope"
                  value={value}
                  checked={scope === value}
                  onChange={() => setScope(value)}
                  disabled={value === 'filtered' && filteredTotal === 0}
                />
                {value === 'all'
                  ? `All Bridge Domains (${hostTotal})`
                  : `Current filters (${filteredTotal})`}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <button
              type="button"
              disabled={exporting}
              onClick={() => setOpen(false)}
              className="px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={exporting || (scope === 'filtered' && !filteredTotal)}
              onClick={download}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {exporting ? 'Exporting…' : 'Export'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
