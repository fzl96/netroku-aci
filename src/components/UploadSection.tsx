// src/components/UploadSection.tsx
'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { validateCsvRows } from '@/lib/apic/csv'
import type { CsvValidationError, ParsedRow } from '@/lib/apic/types'
import { cn } from '@/lib/utils'

type Validator<TRow> = (
  rawRows: Record<string, string>[],
  headers: string[]
) => { rows: TRow[]; errors: CsvValidationError[] }

interface UploadSectionProps<TRow> {
  onUploaded: (rows: TRow[]) => void
  validator?: Validator<TRow>
  requiredColumnsHelp?: string
}

const DEFAULT_REQUIRED_COLUMNS_HELP =
  'Required columns: tenant, ap, epg, vlan, node1, node2, port_type, interface_or_ipg, mode, immediacy'

export function UploadSection<TRow = ParsedRow>({
  onUploaded,
  validator,
  requiredColumnsHelp,
}: UploadSectionProps<TRow>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<CsvValidationError[]>([])

  const validate = (validator ?? (validateCsvRows as unknown as Validator<TRow>))
  const helpText = requiredColumnsHelp ?? DEFAULT_REQUIRED_COLUMNS_HELP

  function processFile(file: File) {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete(result) {
        const headers = result.meta.fields ?? []
        const { rows, errors: validationErrors } = validate(result.data, headers)
        if (validationErrors.length > 0) {
          setErrors(validationErrors)
        } else {
          setErrors([])
          onUploaded(rows)
        }
      },
    })
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div>
      {/* Card header */}
      <div className="border-b border-subtle px-6 pt-6 pb-5">
        <h2 className="font-serif text-base font-semibold text-foreground">Upload CSV</h2>
        <p className="mt-0.5 text-xs text-subtle">Drop a file or click to select</p>
      </div>

      {/* Body */}
      <div className="px-6 py-5">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            'group cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all',
            dragging
              ? 'border-primary bg-primary/10'
              : 'border-border bg-muted hover:border-primary/60',
          )}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 32 32"
            fill="none"
            className="mx-auto mb-3 text-faint transition-opacity group-hover:opacity-70"
          >
            <rect x="6" y="2" width="20" height="28" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11h10M11 16h10M11 21h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm font-medium text-muted-foreground">Drop your CSV here</p>
          <p className="mt-1 text-xs text-subtle">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {errors.length > 0 && (
          <div className="mt-3 space-y-1">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-error">
                {err.rowIndex > 0 ? `Row ${err.rowIndex} · ` : ''}
                {err.field}: {err.message}
              </p>
            ))}
          </div>
        )}

        <p className="mt-4 font-mono text-[11px] text-subtle">{helpText}</p>
      </div>
    </div>
  )
}
