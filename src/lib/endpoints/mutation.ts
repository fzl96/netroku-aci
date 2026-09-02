import 'server-only'

import { revalidateTag } from 'next/cache'
import { AuthenticationRequiredError, requireSession } from '@/lib/auth'
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

type ResyncInput = {
  apicHostId: string
  host: string
  username: string
  password: string
}

type AuditInput = {
  userId: string | null
  userName: string
  action: 'resync.endpoints'
  target: string
  status?: 'success' | 'failure'
  detail: string
}

export type EndpointMutationDependencies = {
  requireSession: () => Promise<{ id: string; userName: string }>
  findHost: (id: string) => Promise<{ id: string; name: string; host: string } | null>
  resyncEndpoints: (input: ResyncInput) => Promise<{ synced: number; total: number }>
  recordAudit: (input: AuditInput) => Promise<void>
  revalidateTag: (tag: string, profile: { expire: number }) => void
  isInProgressError: (error: unknown) => boolean
  isAuthenticationRequiredError: (error: unknown) => boolean
  reportAuditError?: (error: unknown) => void
}

type ResolvedInput = ScheduledEndpointResyncInput & {
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

/** Deep, injectable implementation; production exports below use server-only dependencies. */
export function createEndpointMutation(dependencies: EndpointMutationDependencies) {
  function invalidateEndpointReads(apicHostId: string): void {
    dependencies.revalidateTag('endpoints:all', { expire: 0 })
    dependencies.revalidateTag(`endpoints:host:${apicHostId}`, { expire: 0 })
  }

  async function audit(input: AuditInput): Promise<void> {
    try {
      await dependencies.recordAudit(input)
    } catch (error) {
      dependencies.reportAuditError?.(error)
    }
  }

  async function resyncResolvedEndpointInventory(
    input: ResolvedInput,
  ): Promise<{ synced: number; total: number }> {
    const { apicHostId, hostName, host, username, password, actor } = input
    const target = `${hostName} (${host})`
    let result: { synced: number; total: number }

    try {
      result = await dependencies.resyncEndpoints({ apicHostId, host, username, password })
    } catch (error) {
      if (actor.kind === 'scheduler') {
        await audit({
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

    await audit({
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

  async function resyncEndpointInventory(input: {
    apicHostId: string
    username: string
    password: string
  }): Promise<EndpointResyncResult> {
    let actor: { id: string; userName: string }
    try {
      actor = await dependencies.requireSession()
    } catch (error) {
      if (!dependencies.isAuthenticationRequiredError(error)) throw error
      return { ok: false, code: 'unauthorized', error: 'Unauthorized' }
    }

    const apicHost = await dependencies.findHost(input.apicHostId)
    if (!apicHost) return { ok: false, code: 'host-not-found', error: 'Host not found' }

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
      if (dependencies.isInProgressError(error.reason)) {
        return {
          ok: false,
          code: 'in-progress',
          error: 'Endpoint resync is already in progress',
        }
      }
      return { ok: false, code: 'sync-failed', error: 'Failed to resync endpoints' }
    }
  }

  async function resyncEndpointInventoryForScheduler(
    input: ScheduledEndpointResyncInput,
  ): Promise<{ synced: number; total: number }> {
    return resyncResolvedEndpointInventory({
      ...input,
      username: input.username.trim(),
      actor: { kind: 'scheduler' },
    })
  }

  return {
    invalidateEndpointReads,
    resyncEndpointInventory,
    resyncEndpointInventoryForScheduler,
  }
}

const endpointMutation = createEndpointMutation({
  requireSession,
  findHost: id => prisma.apicHost.findFirst({ where: { id } }),
  resyncEndpoints,
  recordAudit,
  revalidateTag,
  isInProgressError: error => error instanceof EndpointResyncInProgressError,
  isAuthenticationRequiredError: error => error instanceof AuthenticationRequiredError,
  reportAuditError: error => console.error('[endpoints] failed to record resync audit', error),
})

export const {
  invalidateEndpointReads,
  resyncEndpointInventory,
  resyncEndpointInventoryForScheduler,
} = endpointMutation
