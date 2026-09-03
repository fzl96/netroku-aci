'use server'

import type { ApicHostFormValues, ApicHostUpdateFormValues } from '@/lib/schemas/apic-host'
import {
  createApicHost as createApicHostRecord,
  deleteApicHost as deleteApicHostRecord,
  updateApicHost as updateApicHostRecord,
  type ApicHostActionResult,
  type SafeApicHost,
} from './mutation'

/** `mutation.ts` is `server-only`, not `'use server'`: a client component
 *  cannot call its exports directly as Server Actions, so this file is the
 *  thin browser-callable boundary the other purposes also use. */
export async function createApicHost(
  data: ApicHostFormValues,
): Promise<ApicHostActionResult<SafeApicHost>> {
  return createApicHostRecord(data)
}

export async function updateApicHost(
  id: string,
  data: ApicHostUpdateFormValues,
): Promise<ApicHostActionResult<SafeApicHost>> {
  return updateApicHostRecord(id, data)
}

export async function deleteApicHost(id: string): Promise<ApicHostActionResult<void>> {
  return deleteApicHostRecord(id)
}
