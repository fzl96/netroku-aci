'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { IconDownload } from '@tabler/icons-react'
import type { EndpointFilters } from '@/lib/endpoints/query'
import { hasActiveEndpointFilters } from '@/lib/endpoints/query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  buildEndpointExportPayload,
  getDefaultExportScope,
  type ExportGrouping,
  type ExportScope,
} from './export-utils'

interface Props {
  apicHostId: string
  hostTotal: number
  filteredTotal: number
  filters: EndpointFilters
}

export function ExportEndpointsDialog({
  apicHostId,
  hostTotal,
  filteredTotal,
  filters,
}: Props) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [scope, setScope] = useState<ExportScope>('all')
  const [groupBy, setGroupBy] = useState<ExportGrouping | null>(null)
  const [exporting, setExporting] = useState(false)

  const hasFilters = useMemo(() => hasActiveEndpointFilters(filters), [filters])
  const filteredUnavailable = hasFilters && filteredTotal === 0
  const disabled = !apicHostId || hostTotal === 0

  function openDialog() {
    setStep(1)
    setScope(getDefaultExportScope(hasFilters, filteredTotal))
    setGroupBy(null)
    setOpen(true)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (exporting) return
    setOpen(nextOpen)
  }

  async function handleExport() {
    if (!groupBy) return

    setExporting(true)
    try {
      const payload = buildEndpointExportPayload({
        apicHostId,
        scope,
        groupBy,
        filters,
      })
      const res = await fetch('/api/endpoints/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        throw new Error(data?.error ?? 'Export failed')
      }

      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition')
      const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'endpoints.xlsx'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setOpen(false)
      toast.success('Endpoint export downloaded')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={disabled}
        className={[
          'flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg border transition-colors shadow-sm',
          !disabled
            ? 'border-border bg-card text-foreground hover:bg-muted'
            : 'border-border bg-muted text-faint cursor-not-allowed',
        ].join(' ')}
      >
        <IconDownload size={12} stroke={1.75} />
        Export
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-card border-border text-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-base font-semibold text-foreground">
              Export endpoints
            </DialogTitle>
            <DialogDescription className="text-xs text-subtle">
              {step === 1
                ? 'Choose which endpoint set should be included.'
                : 'Choose how the workbook should be grouped.'}
            </DialogDescription>
          </DialogHeader>

          {step === 1 ? (
            <div className="space-y-2">
              <ChoiceCard
                checked={scope === 'all'}
                title="All endpoints"
                description={`${hostTotal} endpoint${hostTotal === 1 ? '' : 's'} from this APIC host`}
                onClick={() => setScope('all')}
              />
              <ChoiceCard
                checked={scope === 'filtered'}
                disabled={filteredUnavailable}
                title="Current filters"
                description={
                  filteredUnavailable
                    ? 'No endpoints match the current filters'
                    : `${filteredTotal} matching endpoint${filteredTotal === 1 ? '' : 's'} across all pages`
                }
                onClick={() => setScope('filtered')}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <ChoiceCard
                checked={groupBy === 'node'}
                title="Group by Node"
                description="Create one worksheet per node"
                onClick={() => setGroupBy('node')}
              />
              <ChoiceCard
                checked={groupBy === 'vlan'}
                title="Group by VLAN"
                description="Create one worksheet per VLAN"
                onClick={() => setGroupBy('vlan')}
              />
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 flex flex-row items-center justify-between rounded-b-xl border-t border-subtle bg-muted px-4 py-3 gap-2">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={exporting}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-2 disabled:opacity-60"
              >
                Back
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={exporting}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors px-4 py-2 disabled:opacity-60"
              >
                Cancel
              </button>
              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={scope === 'filtered' && filteredUnavailable}
                  className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={!groupBy || exporting}
                  className="bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                >
                  {exporting ? 'Exporting…' : 'Export'}
                </button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ChoiceCard({
  checked,
  disabled,
  title,
  description,
  onClick,
}: {
  checked: boolean
  disabled?: boolean
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'w-full rounded-xl border px-4 py-3 text-left transition-colors',
        checked
          ? 'border-primary bg-primary/8'
          : 'border-border bg-background hover:bg-muted',
        disabled ? 'opacity-50 cursor-not-allowed hover:bg-background' : '',
      ].join(' ')}
    >
      <span className="flex items-start gap-3">
        <span
          className={[
            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            checked ? 'border-primary bg-primary' : 'border-border bg-background',
          ].join(' ')}
        >
          {checked && <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
        </span>
        <span>
          <span className="block text-sm font-medium text-foreground">{title}</span>
          <span className="block text-xs text-subtle mt-0.5">{description}</span>
        </span>
      </span>
    </button>
  )
}
