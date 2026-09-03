'use server'

import { createUserRecord, deleteUserRecord, type CreateUserValues } from './mutation'
import type { SafeUser } from './query'

type ActionResult<T> = { success: true; data: T } | { success: false; error: string }

export async function createUser(data: CreateUserValues): Promise<ActionResult<SafeUser>> {
  try {
    return { success: true, data: await createUserRecord(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteUser(id: string): Promise<ActionResult<void>> {
  try {
    await deleteUserRecord(id)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
