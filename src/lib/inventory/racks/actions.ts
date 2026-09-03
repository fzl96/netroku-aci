'use server'

import type { RackFormValues, RackUpdateFormValues } from '@/lib/schemas/rack'
import { createRackRecord, deleteRackRecord, updateRackRecord } from './mutation'
import type { SafeRack } from './query'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createRack(data: RackFormValues): Promise<ActionResult<SafeRack>> {
  try {
    return { success: true, data: await createRackRecord(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateRack(
  id: string,
  data: RackUpdateFormValues,
): Promise<ActionResult<SafeRack>> {
  try {
    return { success: true, data: await updateRackRecord(id, data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteRack(id: string): Promise<ActionResult<void>> {
  try {
    await deleteRackRecord(id)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
