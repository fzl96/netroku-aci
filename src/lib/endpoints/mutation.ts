import 'server-only'

import { revalidateTag } from 'next/cache'
import { requireSession } from '@/lib/auth'
import { recordAudit } from '@/lib/audit'
import {
  EndpointResyncInProgressError,
  resyncEndpoints,
} from '@/lib/apic/endpoints'
import { prisma } from '@/lib/prisma'

export type EndpointResyncResult =
  | { ok: true; synced: number; total: number }
  | {
      ok: false
      code: 'unauthorized' | 'host-not-found' | 'in-progress' | 'sync-failed'
      error: string
    }

export type ScheduledEndpointResyncInput = {
  apicHostId: string
  hostName: string
  host: string
  username: string
  password: string
}

type ResolvedEndpointResyncInput = ScheduledEndpointResyncInput & {
  actor:
    | { kind: 'user'; id: string; userName: string }
    | { kind: 'scheduler' }
}

class EndpointInventorySyncFailure extends Error {
  constructor(readonly reason: unknown) {
    super('Endpoint inventory sync failed')
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Failed to resync endpoints'
}

/** Immediately expire every cached Endpoint projection affected by a host write. */
export function invalidateEndpointReads(apicHostId: string): void {
  revalidateTag('endpoints:all', { expire: 0 })
  revalidateTag(`endpoints:host:${apicHostId}`, { expire: 0 })
}

async function resyncResolvedEndpointInventory(
  input: ResolvedEndpointResyncInput,
): Promise<{ synced: number; total: number }> {
  const { apicHostId, hostName, host, username, password, actor } = input
  const target = `${hostName} (${host})`
  let result: { synced: number; total: number }

  try {
    result = await resyncEndpoints({ apicHostId, host, username, password })
  } catch (error) {
    if (actor.kind === 'scheduler') {
      await recordAudit({
        userId: null,
        userName: 'scheduler',
        action: 'resync.endpoints',
        target,
        status: 'failure',
        detail: errorMessage(error),
      })
      throw error
    }
    throw new EndpointInventorySyncFailure(error)
  }

  await recordAudit({
    userId: actor.kind === 'user' ? actor.id : null,
    userName: actor.kind === 'user' ? actor.userName : 'scheduler',
    action: 'resync.endpoints',
    target,
    ...(actor.kind === 'scheduler' ? { status: 'success' as const } : {}),
    detail: `synced ${result.synced} (total ${result.total})`,
  })
  invalidateEndpointReads(apicHostId)
  return result
}

/** Authenticated manual endpoint resync used by the HTTP transport adapter. */
export async function resyncEndpointInventory(input: {
  apicHostId: string
  username: string
  password: string
}): Promise<EndpointResyncResult> {
  let actor: Awaited<ReturnType<typeof requireSession>>
  try {
    actor = await requireSession()
  } catch {
    return { ok: false, code: 'unauthorized', error: 'Unauthorized' }
  }

  const apicHost = await prisma.apicHost.findFirst({ where: { id: input.apicHostId } })
  if (!apicHost) {
    return { ok: false, code: 'host-not-found', error: 'Host not found' }
  }

  try {
    const result = await resyncResolvedEndpointInventory({
      apicHostId: input.apicHostId,
      hostName: apicHost.name,
      host: apicHost.host,
      username: input.username.trim(),
      password: input.password,
      actor: { kind: 'user', id: actor.id, userName: actor.userName },
    })
    return { ok: true, ...result }
  } catch (error) {
    if (!(error instanceof EndpointInventorySyncFailure)) throw error
    if (error.reason instanceof EndpointResyncInProgressError) {
      return {
        ok: false,
        code: 'in-progress',
        error: 'Endpoint resync is already in progress',
      }
    }
    return { ok: false, code: 'sync-failed', error: 'Failed to resync endpoints' }
  }
}

/** Trusted scheduler entry: host resolution and scheduler authorization happen upstream. */
export async function resyncEndpointInventoryForScheduler(
  input: ScheduledEndpointResyncInput,
): Promise<{ synced: number; total: number }> {
  return resyncResolvedEndpointInventory({
    ...input,
    username: input.username.trim(),
    actor: { kind: 'scheduler' },
  })
}
