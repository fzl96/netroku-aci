'use server'

import type { SiteFormValues, SiteUpdateFormValues } from '@/lib/schemas/site'
import { createSiteRecord, deleteSiteRecord, updateSiteRecord } from './mutation'
import type { SafeSite } from './query'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function createSite(data: SiteFormValues): Promise<ActionResult<SafeSite>> {
  try {
    return { success: true, data: await createSiteRecord(data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function updateSite(
  id: string,
  data: SiteUpdateFormValues,
): Promise<ActionResult<SafeSite>> {
  try {
    return { success: true, data: await updateSiteRecord(id, data) }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function deleteSite(id: string): Promise<ActionResult<void>> {
  try {
    await deleteSiteRecord(id)
    return { success: true, data: undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
