'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { toast } from 'sonner'
import {
  IconArrowLeft,
  IconDownload,
  IconUpload,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
  IconBuilding,
  IconServer,
  IconAlertTriangle,
} from '@tabler/icons-react'

import {
  parseCsvRows,
  SAMPLE_CSV_TEMPLATE,
  type ParsedImportRow,
  type CsvImportError,
  type MalformedImportRow,
} from '@/lib/inventory/csv'
import {
  validateDeviceImport,
  executeDeviceImport,
  type ValidationResultData,
  type ImportExecutionResult,
} from '@/actions/inventory/import'
import { Button } from '@/components/ui/button'
import { DENSE_TABLE_HEAD_CLS, TABLE_SCROLL_CLS } from '@/lib/ui-classes'

type ImportStage = 'UPLOAD' | 'REVIEW' | 'COMPLETE'
type TableFilter = 'ALL' | 'VALID' | 'CREATE' | 'UPDATE' | 'ERRORS'

export function DeviceImportClient() {
  const [stage, setStage] = useState<ImportStage>('UPLOAD')
  const [isParsing, setIsParsing] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)

  const [clientErrors, setClientErrors] = useState<CsvImportError[]>([])
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([])
  const [validationData, setValidationData] = useState<ValidationResultData | null>(null)
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null)

  const [filter, setFilter] = useState<TableFilter>('ALL')
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const blob = new Blob([SAMPLE_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', 'device_inventory_template.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please upload a valid .csv file')
      return
    }

    setIsParsing(true)
    setClientErrors([])

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (result) => {
        const headers = result.meta.fields ?? []
        const parseResult = parseCsvRows(result.data, headers)

        // If there is a missing header error (rowIndex 0), block at upload stage
        const headerErrors = parseResult.errors.filter((e) => e.rowIndex === 0)
        if (headerErrors.length > 0) {
          setClientErrors(headerErrors)
          setIsParsing(false)
          return
        }

        if (parseResult.rows.length === 0 && parseResult.malformedRows.length === 0) {
          setClientErrors([{ rowIndex: 0, field: 'file', message: 'CSV file contains no data rows' }])
          setIsParsing(false)
          return
        }

        setParsedRows(parseResult.rows)
        setIsParsing(false)

        // Perform server dry run validation passing valid and malformed rows
        await runServerValidation(parseResult.rows, parseResult.malformedRows)
      },
      error: (err) => {
        setIsParsing(false)
        toast.error(`CSV Parsing error: ${err.message}`)
      },
    })
  }

  async function runServerValidation(
    rowsToValidate: ParsedImportRow[],
    malformedRows: MalformedImportRow[] = [],
  ) {
    setIsValidating(true)
    const res = await validateDeviceImport(rowsToValidate, malformedRows)
    setIsValidating(false)

    if (res.success) {
      setValidationData(res.data)
      setStage('REVIEW')
    } else {
      toast.error(res.error)
    }
  }

  async function handleExecute() {
    if (!parsedRows.length) return
    setIsExecuting(true)
    const res = await executeDeviceImport(parsedRows)
    setIsExecuting(false)

    if (res.success) {
      setExecutionResult(res.data)
      setStage('COMPLETE')
      toast.success('Devices successfully imported!')
    } else {
      toast.error(res.error)
    }
  }

  function resetImport() {
    setStage('UPLOAD')
    setClientErrors([])
    setParsedRows([])
    setValidationData(null)
    setExecutionResult(null)
    setFilter('ALL')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const filteredRowStates = validationData?.rowStates.filter((rs) => {
    if (filter === 'VALID') return rs.errors.length === 0
    if (filter === 'CREATE') return rs.action === 'CREATE' && rs.errors.length === 0
    if (filter === 'UPDATE') return rs.action === 'UPDATE' && rs.errors.length === 0
    if (filter === 'ERRORS') return rs.errors.length > 0
    return true
  }) ?? []

  return (
    <div className="flex-1 space-y-6 p-8 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/inventory/devices"
              className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1 text-xs"
            >
              <IconArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Devices</span>
            </Link>
          </div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-foreground">
            Import Devices from CSV
          </h1>
          <p className="text-xs text-subtle">
            Bulk register new hardware, update existing devices via serial number, and assign rack and stack placements.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5 text-xs">
            <IconDownload className="h-4 w-4 text-muted-foreground" />
            Download Sample CSV
          </Button>
        </div>
      </div>

      {/* STAGE 1: UPLOAD */}
      {stage === 'UPLOAD' && (
        <div className="space-y-6 animate-fade-up">
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) handleFile(file)
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
              dragging
                ? 'border-primary bg-muted/40'
                : 'border-border bg-card hover:border-border/80 hover:bg-muted/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                {isParsing || isValidating ? (
                  <IconRefresh className="h-6 w-6 animate-spin" />
                ) : (
                  <IconUpload className="h-6 w-6" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  {isParsing
                    ? 'Parsing CSV data...'
                    : isValidating
                      ? 'Validating against database...'
                      : 'Click to select or drag and drop your CSV file'}
                </p>
                <p className="text-xs text-subtle">
                  Supports .csv files formatted with device, rack, and stack columns
                </p>
              </div>
            </div>
          </div>

          {/* Client-side syntax/header errors */}
          {clientErrors.length > 0 && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-medium text-xs">
                <IconAlertTriangle className="h-4 w-4 shrink-0" />
                <span>Found {clientErrors.length} issue(s) in CSV format:</span>
              </div>
              <ul className="space-y-1 text-xs text-destructive list-disc list-inside max-h-60 overflow-y-auto pl-1">
                {clientErrors.map((err, i) => (
                  <li key={i}>
                    {err.rowIndex > 0 ? `Row ${err.rowIndex}: ` : ''}
                    <span className="font-mono">{err.field}</span> — {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Feature Highlights Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <IconBuilding className="h-4 w-4 text-muted-foreground" />
                <span>Dynamic Site & Rack Provisioning</span>
              </div>
              <p className="text-xs text-subtle leading-relaxed">
                Missing sites and racks specified in the CSV will be automatically created on the fly during import.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <IconRefresh className="h-4 w-4 text-muted-foreground" />
                <span>Serial Number Upsert</span>
              </div>
              <p className="text-xs text-subtle leading-relaxed">
                Rows with matching serial numbers in the database will update the existing device record rather than duplicate it.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 space-y-1">
              <div className="flex items-center gap-2 text-foreground font-medium text-xs">
                <IconServer className="h-4 w-4 text-muted-foreground" />
                <span>Collision & Height Checking</span>
              </div>
              <p className="text-xs text-subtle leading-relaxed">
                Intra-file and cross-database rack slot overlap checks prevent accidental dual-device assignments.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 2: REVIEW & VALIDATION */}
      {stage === 'REVIEW' && validationData && (
        <div className="space-y-5 animate-fade-up">
          {/* Summary Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-[11px] font-medium text-subtle uppercase tracking-wider">Total Rows</div>
              <div className="text-xl font-bold font-mono text-foreground">
                {validationData.summary.totalRows}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-[11px] font-medium text-subtle uppercase tracking-wider">
                New Devices
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                +{validationData.summary.createCount}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-[11px] font-medium text-subtle uppercase tracking-wider">
                To Update
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                ~{validationData.summary.updateCount}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-[11px] font-medium text-subtle uppercase tracking-wider">
                New Sites
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {validationData.summary.sitesToCreate.length}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 space-y-1">
              <div className="text-[11px] font-medium text-subtle uppercase tracking-wider">
                New Racks
              </div>
              <div className="text-xl font-bold font-mono text-foreground">
                {validationData.summary.racksToCreate.length}
              </div>
            </div>

            <div
              className={`rounded-xl border p-3 space-y-1 bg-card ${
                validationData.summary.errorCount > 0
                  ? 'border-destructive/40'
                  : 'border-border'
              }`}
            >
              <div className={`text-[11px] font-medium uppercase tracking-wider ${validationData.summary.errorCount > 0 ? 'text-destructive' : 'text-subtle'}`}>
                Errors
              </div>
              <div className={`text-xl font-bold font-mono ${validationData.summary.errorCount > 0 ? 'text-destructive' : 'text-foreground'}`}>
                {validationData.summary.errorCount}
              </div>
            </div>
          </div>

          {/* Provisioning Notifications */}
          {(validationData.summary.sitesToCreate.length > 0 ||
            validationData.summary.racksToCreate.length > 0) && (
            <div className="rounded-xl border border-border bg-card p-3.5 space-y-2 text-xs">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <IconBuilding className="h-4 w-4 text-muted-foreground" />
                <span>Entities to be Provisioned Automatically:</span>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {validationData.summary.sitesToCreate.map((site) => (
                  <span
                    key={site}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted border border-border font-mono text-[11px] text-foreground"
                  >
                    + Site: {site}
                  </span>
                ))}
                {validationData.summary.racksToCreate.map((r, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted border border-border font-mono text-[11px] text-foreground"
                  >
                    + Rack: {r.siteName} / {r.rackName}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Table Header Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border border-border text-xs">
              <button
                onClick={() => setFilter('ALL')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  filter === 'ALL'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                All ({validationData.summary.totalRows})
              </button>
              <button
                onClick={() => setFilter('VALID')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  filter === 'VALID'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                Valid ({validationData.summary.validCount})
              </button>
              <button
                onClick={() => setFilter('CREATE')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  filter === 'CREATE'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                Create ({validationData.summary.createCount})
              </button>
              <button
                onClick={() => setFilter('UPDATE')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  filter === 'UPDATE'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-subtle hover:text-foreground'
                }`}
              >
                Update ({validationData.summary.updateCount})
              </button>
              {validationData.summary.errorCount > 0 && (
                <button
                  onClick={() => setFilter('ERRORS')}
                  className={`px-3 py-1 rounded font-medium transition-all ${
                    filter === 'ERRORS'
                      ? 'bg-card text-destructive shadow-xs font-semibold'
                      : 'text-destructive hover:text-destructive'
                  }`}
                >
                  Errors ({validationData.summary.errorCount})
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={resetImport} className="text-xs">
                Upload Different File
              </Button>
              <Button
                size="sm"
                onClick={handleExecute}
                disabled={!validationData.canImport || isExecuting || validationData.summary.validCount === 0}
                className="text-xs gap-1.5"
              >
                {isExecuting ? (
                  <>
                    <IconRefresh className="h-4 w-4 animate-spin" />
                    Importing...
                  </>
                ) : validationData.summary.errorCount > 0 ? (
                  <>
                    <IconCheck className="h-4 w-4" />
                    Import {validationData.summary.validCount} Valid Devices (Skip {validationData.summary.errorCount} Errors)
                  </>
                ) : (
                  <>
                    <IconCheck className="h-4 w-4" />
                    Import All {validationData.summary.totalRows} Devices
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Interactive Preview Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            <div className={TABLE_SCROLL_CLS}>
              <table className="w-full text-xs text-left">
                <thead className={DENSE_TABLE_HEAD_CLS}>
                  <tr>
                    <th className="px-3 py-2.5 w-12 font-mono">#</th>
                    <th className="px-3 py-2.5 w-24">Action</th>
                    <th className="px-3 py-2.5 font-semibold text-foreground">Hostname</th>
                    <th className="px-3 py-2.5">Serial Number</th>
                    <th className="px-3 py-2.5">Management IP</th>
                    <th className="px-3 py-2.5">Asset Tag</th>
                    <th className="px-3 py-2.5">Vendor / Model</th>
                    <th className="px-3 py-2.5">Site & Rack</th>
                    <th className="px-3 py-2.5">U Pos</th>
                    <th className="px-3 py-2.5">Stack & Role</th>
                    <th className="px-3 py-2.5">Status & Validation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-sans">
                  {filteredRowStates.map((rs, idx) => {
                    const hasError = rs.errors.length > 0
                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          hasError
                            ? 'bg-destructive/5 hover:bg-destructive/10'
                            : 'hover:bg-muted/40'
                        }`}
                      >
                        <td className="px-3 py-2 font-mono text-muted-foreground">
                          {rs.row.rowIndex}
                        </td>
                        <td className="px-3 py-2">
                          {rs.action === 'CREATE' ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-500/15 text-green-700 dark:text-green-400">
                              CREATE
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-700 dark:text-blue-400">
                              UPDATE
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">
                          {rs.row.hostname}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                          {rs.row.serialNumber}
                        </td>
                        <td className="px-3 py-2 font-mono text-foreground whitespace-nowrap">
                          {rs.row.managementIp ?? '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-subtle whitespace-nowrap">
                          {rs.row.assetTag ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-subtle whitespace-nowrap">
                          {rs.row.vendor} {rs.row.model} ({rs.row.heightU}U)
                        </td>
                        <td className="px-3 py-2 text-subtle whitespace-nowrap">
                          {rs.row.rack ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                              {rs.row.site ? `${rs.row.site} · ` : ''}
                              {rs.row.rack}
                              {rs.rackStatus === 'WILL_CREATE' && (
                                <span className="text-[10px] text-subtle font-sans">
                                  (new)
                                </span>
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-subtle whitespace-nowrap">
                          {rs.row.rackPosition ? `U${rs.row.rackPosition}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-subtle whitespace-nowrap">
                          {rs.row.stackName ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] text-foreground">
                              <span>{rs.row.stackName}</span>
                              <span className="text-muted-foreground text-[10px]">
                                · {rs.row.stackRole === 'MASTER' ? 'Master' : 'Member'}
                                {rs.row.switchId != null ? ` (SW #${rs.row.switchId})` : ''}
                              </span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {hasError ? (
                            <div className="space-y-0.5">
                              {rs.errors.map((err, errI) => (
                                <div
                                  key={errI}
                                  className="text-[11px] font-medium text-destructive flex items-center gap-1"
                                >
                                  <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                                  <span>{err}</span>
                                </div>
                              ))}
                            </div>
                          ) : rs.warnings.length > 0 ? (
                            <div className="text-[11px] text-subtle">
                              {rs.warnings.join('; ')}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400">
                              <IconCheck className="h-3.5 w-3.5" /> Ready
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 3: COMPLETE */}
      {stage === 'COMPLETE' && executionResult && (
        <div className="rounded-xl border border-border bg-card p-8 space-y-6 text-center max-w-xl mx-auto animate-fade-up shadow-sm">
          <div className="h-12 w-12 rounded-full bg-muted text-foreground mx-auto flex items-center justify-center">
            <IconCheck className="h-6 w-6" />
          </div>

          <div className="space-y-1.5">
            <h2 className="font-serif text-xl font-bold text-foreground">
              Import Completed Successfully
            </h2>
            <p className="text-xs text-subtle">
              Your device inventory, rack assignments, and switch stacks have been updated.
            </p>
            {executionResult.skippedErrorsCount > 0 && (
              <p className="text-xs text-subtle pt-1">
                <span className="font-mono text-foreground font-semibold">{executionResult.skippedErrorsCount}</span> device(s) with errors were skipped.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-left">
            <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
              <div className="text-[10px] uppercase font-semibold text-subtle">
                Devices Created
              </div>
              <div className="text-lg font-bold font-mono text-foreground">
                +{executionResult.createdCount}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
              <div className="text-[10px] uppercase font-semibold text-subtle">
                Devices Updated
              </div>
              <div className="text-lg font-bold font-mono text-foreground">
                ~{executionResult.updatedCount}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
              <div className="text-[10px] uppercase font-semibold text-subtle">
                Sites Provisioned
              </div>
              <div className="text-lg font-bold font-mono text-foreground">
                {executionResult.sitesCreated}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-3 space-y-0.5">
              <div className="text-[10px] uppercase font-semibold text-subtle">
                Racks Provisioned
              </div>
              <div className="text-lg font-bold font-mono text-foreground">
                {executionResult.racksCreated}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="outline" size="sm" onClick={resetImport} className="text-xs">
              Import Another File
            </Button>
            <Button size="sm" asChild className="text-xs">
              <Link href="/inventory/devices">View Device Inventory</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild className="text-xs">
              <Link href="/inventory/racks">View Racks & Elevation</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
