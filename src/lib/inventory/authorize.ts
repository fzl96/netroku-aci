import 'server-only'

import { AuthenticationRequiredError, requireSession, type AuthenticatedUser } from '@/lib/auth'
import { InventoryReadError } from './errors'

/** Sites, racks, and devices share one authorization boundary: every purpose
 *  read requires a session, and only the mutation layer additionally requires
 *  the admin role. */
export async function authorizeInventoryRead(): Promise<AuthenticatedUser> {
  try {
    return await requireSession()
  } catch (error) {
    if (!(error instanceof AuthenticationRequiredError)) throw error
    throw new InventoryReadError()
  }
}

export async function readInventoryData<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    if (error instanceof InventoryReadError) throw error
    throw new InventoryReadError('read-failed', { cause: error })
  }
}

export async function getInventoryViewerRole(): Promise<'admin' | 'member'> {
  const user = await authorizeInventoryRead()
  return user.role === 'admin' ? 'admin' : 'member'
}
