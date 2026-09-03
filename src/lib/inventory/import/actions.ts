'use server'

import type { MalformedImportRow, ParsedImportRow } from '@/lib/inventory/csv'
import { commitDeviceImport, previewDeviceImport } from './mutation'
import type { ImportExecutionResult, ValidationResultData } from './mutation'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function validateDeviceImport(
  rows: ParsedImportRow[],
  malformedRows: MalformedImportRow[] = [],
): Promise<ActionResult<ValidationResultData>> {
  try {
    return { success: true, data: await previewDeviceImport(rows, malformedRows) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Validation failed' }
  }
}

export async function executeDeviceImport(
  rows: ParsedImportRow[],
): Promise<ActionResult<ImportExecutionResult>> {
  try {
    return { success: true, data: await commitDeviceImport(rows) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Import execution failed' }
  }
}
